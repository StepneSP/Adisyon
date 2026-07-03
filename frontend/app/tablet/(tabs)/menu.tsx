import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "@/src/lib/theme";
import { api, type Category, type MenuItem } from "@/src/lib/api";
import { session } from "@/src/lib/session";

export default function TabletMenu() {
  const [code, setCode] = useState<string | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemDesc, setItemDesc] = useState("");

  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  useEffect(() => {
    (async () => {
      const c = await session.getCode();
      const rid = await session.getRestoranId();
      if (!c || !rid) return;
      setCode(c);
      const [cs, is] = await Promise.all([api.listCategories(rid), api.listItems(rid)]);
      setCats(cs);
      setItems(is);
      setSelectedCat(cs[0]?.id || null);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(
    () => items.filter((i) => (selectedCat ? i.category_id === selectedCat : true)),
    [items, selectedCat],
  );

  const openNewItem = () => {
    setEditingItem(null);
    setItemName("");
    setItemPrice("");
    setItemDesc("");
    setShowItemModal(true);
  };
  const openEditItem = (it: MenuItem) => {
    setEditingItem(it);
    setItemName(it.name);
    setItemPrice(String(it.price));
    setItemDesc(it.description || "");
    setShowItemModal(true);
  };
  const saveItem = async () => {
    if (!code || !selectedCat) return;
    const price = parseFloat(itemPrice);
    if (!itemName.trim() || isNaN(price) || price < 0) {
      Alert.alert("Missing info", "Please enter a name and valid price.");
      return;
    }
    try {
      if (editingItem) {
        const upd = await api.updateItem(code, editingItem.id, {
          name: itemName.trim(),
          price,
          description: itemDesc.trim(),
        });
        setItems((prev) => prev.map((i) => (i.id === upd.id ? upd : i)));
      } else {
        const it = await api.addItem(code, {
          name: itemName.trim(),
          price,
          category_id: selectedCat,
          description: itemDesc.trim(),
          available: true,
        });
        setItems((prev) => [...prev, it]);
      }
      setShowItemModal(false);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not save");
    }
  };
  const removeItem = async () => {
    if (!code || !editingItem) return;
    try {
      await api.deleteItem(code, editingItem.id);
      setItems((prev) => prev.filter((i) => i.id !== editingItem.id));
      setShowItemModal(false);
    } catch {}
  };
  const toggleAvail = async (it: MenuItem) => {
    if (!code) return;
    const upd = await api.updateItem(code, it.id, { available: !it.available });
    setItems((prev) => prev.map((x) => (x.id === upd.id ? upd : x)));
  };

  const addCategory = async () => {
    if (!code || !newCatName.trim()) return;
    const c = await api.addCategory(code, newCatName.trim());
    setCats((prev) => [...prev, c]);
    setSelectedCat(c.id);
    setNewCatName("");
    setShowCatModal(false);
  };
  const deleteCat = async (id: string) => {
    if (!code) return;
    Alert.alert("Delete category?", "All items in this category will be removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await api.deleteCategory(code, id);
          setCats((prev) => prev.filter((c) => c.id !== id));
          setItems((prev) => prev.filter((i) => i.category_id !== id));
          if (selectedCat === id) setSelectedCat(cats[0]?.id || null);
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={theme.color.brand} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Menu</Text>
        <Pressable testID="add-item-button" onPress={openNewItem} style={styles.addBtn}>
          <Feather name="plus" size={18} color="#fff" />
          <Text style={styles.addBtnText}>New item</Text>
        </Pressable>
      </View>

      <View style={styles.chipsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContent}
        >
          {cats.map((c) => {
            const active = c.id === selectedCat;
            return (
              <Pressable
                key={c.id}
                testID={`category-chip-${c.id}`}
                onPress={() => setSelectedCat(c.id)}
                onLongPress={() => deleteCat(c.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.name}</Text>
              </Pressable>
            );
          })}
          <Pressable
            testID="add-category-chip"
            onPress={() => setShowCatModal(true)}
            style={[styles.chip, styles.chipAdd]}
          >
            <Feather name="plus" size={16} color={theme.color.brand} />
          </Pressable>
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.itemList}>
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="coffee" size={40} color={theme.color.borderStrong} />
            <Text style={styles.emptyText}>No items in this category yet.</Text>
          </View>
        ) : (
          filtered.map((it) => (
            <View key={it.id} style={styles.itemCard}>
              <Pressable
                testID={`menu-item-${it.id}`}
                onPress={() => openEditItem(it)}
                style={{ flex: 1 }}
              >
                <Text style={[styles.itemName, !it.available && styles.itemOff]}>{it.name}</Text>
                {it.description ? <Text style={styles.itemDesc}>{it.description}</Text> : null}
                <Text style={styles.itemPrice}>${it.price.toFixed(2)}</Text>
              </Pressable>
              <View style={styles.itemRight}>
                <Text style={styles.availLbl}>{it.available ? "On" : "Off"}</Text>
                <Pressable
                  testID={`menu-item-toggle-${it.id}`}
                  onPress={() => toggleAvail(it)}
                  style={styles.switchContainer}
                >
                  <View style={[styles.switchTrack, it.available && styles.switchTrackActive]}>
                    <View style={[styles.switchThumb, it.available && styles.switchThumbActive]} />
                  </View>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Item Modal */}
      <Modal visible={showItemModal} animationType="slide" transparent onRequestClose={() => setShowItemModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalWrap}
        >
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{editingItem ? "Edit item" : "New item"}</Text>
            <Text style={styles.label}>Name</Text>
            <TextInput
              testID="item-name-input"
              value={itemName}
              onChangeText={setItemName}
              style={styles.input}
              placeholder="e.g. Margherita Pizza"
              placeholderTextColor={theme.color.onSurfaceMuted}
            />
            <Text style={styles.label}>Price</Text>
            <TextInput
              testID="item-price-input"
              value={itemPrice}
              onChangeText={setItemPrice}
              style={styles.input}
              placeholder="12.00"
              placeholderTextColor={theme.color.onSurfaceMuted}
              keyboardType="decimal-pad"
            />
            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              value={itemDesc}
              onChangeText={setItemDesc}
              style={[styles.input, { height: 72 }]}
              placeholder="Short description"
              placeholderTextColor={theme.color.onSurfaceMuted}
              multiline
            />
            <View style={styles.modalActions}>
              {editingItem ? (
                <Pressable style={styles.deleteBtn} onPress={removeItem}>
                  <Feather name="trash-2" size={16} color={theme.color.error} />
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </Pressable>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              <Pressable style={styles.cancelBtn} onPress={() => setShowItemModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable testID="save-item-button" style={styles.saveBtn} onPress={saveItem}>
                <Text style={styles.saveBtnText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Category Modal */}
      <Modal visible={showCatModal} animationType="fade" transparent onRequestClose={() => setShowCatModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalWrap}
        >
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>New category</Text>
            <TextInput
              testID="category-name-input"
              value={newCatName}
              onChangeText={setNewCatName}
              style={styles.input}
              placeholder="e.g. Salads"
              placeholderTextColor={theme.color.onSurfaceMuted}
              autoFocus
            />
            <View style={styles.modalActions}>
              <View style={{ flex: 1 }} />
              <Pressable style={styles.cancelBtn} onPress={() => setShowCatModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable testID="save-category-button" style={styles.saveBtn} onPress={addCategory}>
                <Text style={styles.saveBtnText}>Add</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface },
  header: {
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
    backgroundColor: theme.color.surfaceSecondary,
  },
  title: { fontSize: theme.font.xxl, fontWeight: "700", color: theme.color.onSurface },
  addBtn: {
    backgroundColor: theme.color.brand,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radius.pill,
  },
  addBtnText: { color: "#fff", fontWeight: "600", fontSize: theme.font.base },
  chipsRow: { height: 56, borderBottomWidth: 1, borderBottomColor: theme.color.border, backgroundColor: theme.color.surfaceSecondary },
  chipsContent: { paddingHorizontal: theme.space.lg, gap: theme.space.sm, alignItems: "center", height: 56 },
  chip: {
    height: 36, paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surfaceTertiary,
    justifyContent: "center", alignItems: "center",
    flexShrink: 0,
    borderWidth: 1, borderColor: theme.color.border,
  },
  chipActive: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  chipAdd: { paddingHorizontal: 12, borderStyle: "dashed", backgroundColor: "transparent", borderColor: theme.color.brand },
  chipText: { color: theme.color.onSurface, fontWeight: "600", fontSize: theme.font.base },
  chipTextActive: { color: theme.color.onBrand },
  itemList: { padding: theme.space.lg, gap: theme.space.md, paddingBottom: 32 },
  itemCard: {
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    padding: theme.space.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    borderWidth: 1, borderColor: theme.color.border,
  },
  itemName: { fontSize: theme.font.lg, fontWeight: "700", color: theme.color.onSurface },
  itemOff: { color: theme.color.borderStrong, textDecorationLine: "line-through" },
  itemDesc: { fontSize: theme.font.sm, color: theme.color.onSurfaceMuted, marginTop: 2 },
  itemPrice: { fontSize: theme.font.base, fontWeight: "700", color: theme.color.brand, marginTop: 6 },
  itemRight: { alignItems: "center", gap: 4, flexDirection: "row" },
  availLbl: { fontSize: theme.font.sm, color: theme.color.onSurfaceMuted, marginRight: 8 },
  switchContainer: {
    width: 50,
    height: 30,
    justifyContent: "center",
  },
  switchTrack: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.color.border,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  switchTrackActive: {
    backgroundColor: theme.color.brand,
  },
  switchThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  switchThumbActive: {
    alignSelf: "flex-end",
  },
  empty: { alignItems: "center", padding: theme.space.xxxl, gap: theme.space.md },
  emptyText: { color: theme.color.onSurfaceMuted },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: theme.space.lg },
  modal: {
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.lg,
    padding: theme.space.xl,
    gap: theme.space.sm,
  },
  modalTitle: { fontSize: theme.font.xl, fontWeight: "700", color: theme.color.onSurface, marginBottom: theme.space.sm },
  label: { fontSize: theme.font.sm, color: theme.color.onSurfaceMuted, marginTop: theme.space.sm },
  input: {
    borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.md, paddingVertical: theme.space.md,
    fontSize: theme.font.base, color: theme.color.onSurface,
    backgroundColor: theme.color.surface,
  },
  modalActions: { flexDirection: "row", gap: theme.space.sm, marginTop: theme.space.lg, alignItems: "center" },
  deleteBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: theme.space.md, paddingVertical: theme.space.md, borderRadius: theme.radius.md },
  deleteBtnText: { color: theme.color.error, fontWeight: "600" },
  cancelBtn: { paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md, borderRadius: theme.radius.md },
  cancelBtnText: { color: theme.color.onSurfaceMuted, fontWeight: "600" },
  saveBtn: { backgroundColor: theme.color.brand, paddingHorizontal: theme.space.xl, paddingVertical: theme.space.md, borderRadius: theme.radius.md },
  saveBtnText: { color: "#fff", fontWeight: "700" },
});
