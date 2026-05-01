"use client";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { useCategories } from "@/features/menu/use-categories";

export default function CategoriesPage() {
  const { query, create, update, remove } = useCategories();
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingSortOrder, setEditingSortOrder] = useState("0");

  const categories = useMemo(() => query.data ?? [], [query.data]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const parsedSortOrder = Number(sortOrder);
    if (!trimmedName) {
      toast.error("Tên danh mục không được để trống");
      return;
    }
    if (!Number.isFinite(parsedSortOrder)) {
      toast.error("Thứ tự không hợp lệ");
      return;
    }
    try {
      await create.mutateAsync({ name: trimmedName, sortOrder: parsedSortOrder });
      setName("");
      setSortOrder("0");
      toast.success("Tạo danh mục thành công");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tạo danh mục thất bại");
    }
  }

  function startEdit(c: { id: string; name: string; sortOrder: number }) {
    setEditingId(c.id);
    setEditingName(c.name);
    setEditingSortOrder(String(c.sortOrder));
  }

  async function onSaveEdit() {
    if (!editingId) return;
    const trimmedName = editingName.trim();
    const parsedSortOrder = Number(editingSortOrder);
    if (!trimmedName) {
      toast.error("Tên danh mục không được để trống");
      return;
    }
    if (!Number.isFinite(parsedSortOrder)) {
      toast.error("Thứ tự không hợp lệ");
      return;
    }
    try {
      await update.mutateAsync({
        id: editingId,
        input: { name: trimmedName, sortOrder: parsedSortOrder }
      });
      setEditingId(null);
      toast.success("Cập nhật danh mục thành công");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cập nhật danh mục thất bại");
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Bạn có chắc muốn xoá danh mục này?")) return;
    try {
      await remove.mutateAsync(id);
      toast.success("Xoá danh mục thành công");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xoá danh mục thất bại");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Danh mục món</h1>

      <form onSubmit={onCreate} className="flex flex-wrap gap-3">
        <Input
          placeholder="Tên danh mục"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="max-w-sm"
        />
        <Input
          type="number"
          min={0}
          step={1}
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          required
          className="w-28"
        />
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Đang tạo..." : "Tạo mới"}
        </Button>
      </form>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên</TableHead>
              <TableHead>Thứ tự</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading ? (
              <TableRow>
                <TableCell colSpan={4}>Đang tải...</TableCell>
              </TableRow>
            ) : categories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>Chưa có danh mục</TableCell>
              </TableRow>
            ) : (
              categories.map((c) => {
                const isEditing = editingId === c.id;
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="max-w-sm"
                        />
                      ) : (
                        c.name
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={editingSortOrder}
                          onChange={(e) => setEditingSortOrder(e.target.value)}
                          className="w-24"
                        />
                      ) : (
                        c.sortOrder
                      )}
                    </TableCell>
                    <TableCell>{c.isActive ? "Hoạt động" : "Tắt"}</TableCell>
                    <TableCell className="text-right space-x-2">
                      {isEditing ? (
                        <>
                          <Button size="sm" onClick={onSaveEdit} disabled={update.isPending}>
                            Lưu
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingId(null)}
                          >
                            Huỷ
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => startEdit(c)}>
                            Sửa
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => onDelete(c.id)}
                            disabled={remove.isPending}
                          >
                            Xoá
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
