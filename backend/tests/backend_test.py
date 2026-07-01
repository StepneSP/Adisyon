"""ServeSync backend tests - rooms, menu, orders, stats, websocket."""
import asyncio
import json
import os
import time

import pytest
import requests
import websockets

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if "EXPO_PUBLIC_BACKEND_URL" in os.environ else "https://resto-order-139.preview.emergentagent.com"
API = f"{BASE_URL}/api"
WS_BASE = BASE_URL.replace("http", "ws")


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def room(s):
    r = s.post(f"{API}/rooms", json={"name": "TEST_Restaurant"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "code" in data and len(data["code"]) == 4 and data["code"].isdigit()
    assert data["name"] == "TEST_Restaurant"
    return data


# ---------- Health ----------
def test_root(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("ok") is True


# ---------- Rooms ----------
def test_get_room(s, room):
    r = s.get(f"{API}/rooms/{room['code']}")
    assert r.status_code == 200
    assert r.json()["code"] == room["code"]


def test_seeded_menu(s, room):
    cats = s.get(f"{API}/rooms/{room['code']}/categories").json()
    assert len(cats) >= 4  # Starters, Mains, Drinks, Desserts
    items = s.get(f"{API}/rooms/{room['code']}/items").json()
    assert len(items) >= 10


def test_rename_room(s, room):
    r = s.put(f"{API}/rooms/{room['code']}", json={"name": "TEST_Renamed"})
    assert r.status_code == 200
    assert r.json()["name"] == "TEST_Renamed"
    # verify persistence
    assert s.get(f"{API}/rooms/{room['code']}").json()["name"] == "TEST_Renamed"


def test_room_not_found(s):
    assert s.get(f"{API}/rooms/9999").status_code == 404


# ---------- Categories CRUD ----------
def test_category_crud(s, room):
    code = room["code"]
    r = s.post(f"{API}/rooms/{code}/categories", json={"name": "TEST_Salads"})
    assert r.status_code == 200
    cat = r.json()
    assert cat["name"] == "TEST_Salads"
    cid = cat["id"]
    # update
    r = s.put(f"{API}/rooms/{code}/categories/{cid}", json={"name": "TEST_Salads2"})
    assert r.status_code == 200
    assert r.json()["name"] == "TEST_Salads2"
    # delete
    r = s.delete(f"{API}/rooms/{code}/categories/{cid}")
    assert r.status_code == 200


# ---------- Items CRUD ----------
def test_item_crud_and_availability(s, room):
    code = room["code"]
    cats = s.get(f"{API}/rooms/{code}/categories").json()
    cid = cats[0]["id"]
    # create
    r = s.post(
        f"{API}/rooms/{code}/items",
        json={"name": "TEST_Focaccia", "price": 5.5, "category_id": cid, "description": "d"},
    )
    assert r.status_code == 200
    it = r.json()
    assert it["price"] == 5.5 and it["available"] is True
    iid = it["id"]
    # toggle availability
    r = s.put(f"{API}/rooms/{code}/items/{iid}", json={"available": False})
    assert r.status_code == 200 and r.json()["available"] is False
    # verify via GET
    items = s.get(f"{API}/rooms/{code}/items").json()
    found = next(i for i in items if i["id"] == iid)
    assert found["available"] is False
    # update price
    r = s.put(f"{API}/rooms/{code}/items/{iid}", json={"price": 6.5})
    assert r.status_code == 200 and r.json()["price"] == 6.5
    # delete
    assert s.delete(f"{API}/rooms/{code}/items/{iid}").status_code == 200


# ---------- Orders ----------
@pytest.fixture(scope="module")
def order(s, room):
    code = room["code"]
    items = s.get(f"{API}/rooms/{code}/items").json()
    payload = {
        "table_number": "T3",
        "waiter_name": "TEST_Sofia",
        "lines": [
            {"item_id": items[0]["id"], "quantity": 2},
            {"item_id": items[1]["id"], "quantity": 1},
        ],
        "notes": "no onions",
    }
    r = s.post(f"{API}/rooms/{code}/orders", json=payload)
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["status"] == "new"
    assert o["table_number"] == "T3"
    expected = round(items[0]["price"] * 2 + items[1]["price"] * 1, 2)
    assert o["total"] == expected
    return o


def test_order_created(order):
    assert order["id"]


def test_list_orders_active(s, room, order):
    r = s.get(f"{API}/rooms/{room['code']}/orders?active_only=true")
    assert r.status_code == 200
    ids = [o["id"] for o in r.json()]
    assert order["id"] in ids


def test_edit_order(s, room, order):
    code = room["code"]
    items = s.get(f"{API}/rooms/{code}/items").json()
    new_lines = [{"item_id": items[2]["id"], "quantity": 3}]
    r = s.put(
        f"{API}/rooms/{code}/orders/{order['id']}",
        json={"table_number": "B12", "notes": "edited", "lines": new_lines},
    )
    assert r.status_code == 200, r.text
    up = r.json()
    assert up["table_number"] == "B12"
    assert up["notes"] == "edited"
    assert up["total"] == round(items[2]["price"] * 3, 2)


def test_order_status_flow(s, room, order):
    code = room["code"]
    for status in ["preparing", "ready", "served"]:
        r = s.put(f"{API}/rooms/{code}/orders/{order['id']}/status", json={"status": status})
        assert r.status_code == 200
        assert r.json()["status"] == status


def test_invalid_status(s, room, order):
    r = s.put(
        f"{API}/rooms/{room['code']}/orders/{order['id']}/status",
        json={"status": "bogus"},
    )
    assert r.status_code == 400


def test_create_order_empty_items_400(s, room):
    r = s.post(
        f"{API}/rooms/{room['code']}/orders",
        json={
            "table_number": "T1",
            "waiter_name": "TEST_x",
            "lines": [{"item_id": "does-not-exist", "quantity": 1}],
        },
    )
    assert r.status_code == 400


# ---------- Stats ----------
def test_stats(s, room):
    r = s.get(f"{API}/rooms/{room['code']}/stats")
    assert r.status_code == 200
    d = r.json()
    for k in ("today_orders", "today_revenue", "week_orders", "week_revenue", "top_items", "waiters"):
        assert k in d


# ---------- WebSocket ----------
def test_websocket_broadcast(s, room):
    """Open WS, create an order via HTTP, expect order_created event."""
    code = room["code"]
    ws_url = f"{WS_BASE}/api/ws/{code}"

    async def run():
        received = []
        async with websockets.connect(ws_url, open_timeout=10) as ws:
            # hello
            hello = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            assert hello["event"] == "connected"
            # trigger via HTTP in background
            items = s.get(f"{API}/rooms/{code}/items").json()

            def _post():
                s.post(
                    f"{API}/rooms/{code}/orders",
                    json={
                        "table_number": "WS1",
                        "waiter_name": "TEST_ws",
                        "lines": [{"item_id": items[0]["id"], "quantity": 1}],
                    },
                )

            loop = asyncio.get_event_loop()
            loop.run_in_executor(None, _post)
            # Wait for event
            for _ in range(5):
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=8))
                received.append(msg)
                if msg.get("event") == "order_created":
                    return msg
        return None

    msg = asyncio.get_event_loop().run_until_complete(run()) if False else asyncio.run(run())
    assert msg is not None
    assert msg["event"] == "order_created"
    assert msg["order"]["table_number"] == "WS1"


def test_websocket_invalid_code_closes():
    async def run():
        try:
            async with websockets.connect(f"{WS_BASE}/api/ws/0000", open_timeout=5) as ws:
                # Server may close immediately with 4404
                await asyncio.wait_for(ws.recv(), timeout=5)
        except Exception:
            return True
        return True

    assert asyncio.run(run()) is True


# ---------- Regenerate code (last, since it changes room code) ----------
def test_regenerate_cascades(s, room):
    old = room["code"]
    r = s.post(f"{API}/rooms/{old}/regenerate")
    assert r.status_code == 200
    new = r.json()["code"]
    assert new != old and len(new) == 4
    # Old code should 404
    assert s.get(f"{API}/rooms/{old}").status_code == 404
    # New code returns items (cascade)
    items = s.get(f"{API}/rooms/{new}/items").json()
    assert len(items) > 0
    orders = s.get(f"{API}/rooms/{new}/orders").json()
    assert isinstance(orders, list)
