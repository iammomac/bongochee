import { useEffect, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Download, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { SupplierPicker } from "../../components/SupplierPicker";
import { CategoryPicker } from "../../components/CategoryPicker";
import { ModelPicker } from "../../components/ModelPicker";
import {
  createStockIn,
  downloadStockImportTemplate,
  importStockExcel,
  listRecentStockItems,
  updateStockItem,
} from "../../services/stock";
import { extractErrorMessage } from "../../lib/errors";
import { usePermissions } from "../../hooks/usePermissions";
import type { Category, PhoneModel, StockItem, Supplier } from "../../types";

const rowSchema = z
  .object({
    categoryId: z.string().min(1, "Pick a category"),
    categoryName: z.string(),
    modelId: z.string().min(1, "Pick a model"),
    modelName: z.string(),
    quantity: z.number({ invalid_type_error: "Required" }).int().positive("Must be > 0"),
    buyingPrice: z.number({ invalid_type_error: "Required" }).positive("Must be > 0"),
    minSellingPrice: z.number({ invalid_type_error: "Required" }).positive("Must be > 0"),
    maxSellingPrice: z.number({ invalid_type_error: "Required" }).positive("Must be > 0"),
    importError: z.string().nullable().optional(),
  })
  .refine((row) => row.maxSellingPrice >= row.minSellingPrice, {
    message: "Max must be ≥ min",
    path: ["maxSellingPrice"],
  });

const formSchema = z.object({
  supplierId: z.string().min(1, "Select a supplier"),
  supplierName: z.string(),
  importDate: z.string().min(1, "Required"),
  invoiceNumber: z.string().optional(),
  notes: z.string().optional(),
  rows: z.array(rowSchema).min(1, "Add at least one row"),
});

type FormValues = z.infer<typeof formSchema>;

const blankRow = {
  categoryId: "",
  categoryName: "",
  modelId: "",
  modelName: "",
  quantity: 0,
  buyingPrice: 0,
  minSellingPrice: 0,
  maxSellingPrice: 0,
  importError: null as string | null,
};

const currency = (value: number) => new Intl.NumberFormat("en-TZ", { maximumFractionDigits: 0 }).format(value);

function stockStatus(quantityRemaining: number) {
  if (quantityRemaining === 0) return { label: "Out of stock", className: "bg-danger/10 text-danger" };
  if (quantityRemaining <= 5) return { label: "Low", className: "bg-warning/10 text-warning" };
  return { label: "Healthy", className: "bg-success/10 text-success" };
}

interface RowProps {
  index: number;
  control: Control<FormValues>;
  register: ReturnType<typeof useForm<FormValues>>["register"];
  setValue: ReturnType<typeof useForm<FormValues>>["setValue"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
  onRemove: () => void;
  canRemove: boolean;
}

function StockRow({ index, control, register, setValue, errors, onRemove, canRemove }: RowProps) {
  const row = useWatch({ control, name: `rows.${index}` });
  const rowErrors = errors.rows?.[index];

  const categoryValue: Category | null = row?.categoryId
    ? { id: row.categoryId, name: row.categoryName, createdAt: "" }
    : null;
  const modelValue: PhoneModel | null = row?.modelId
    ? { id: row.modelId, category: row.categoryId, name: row.modelName, createdAt: "" }
    : null;

  return (
    <div className="rounded-2xl border border-gray-100 p-4 dark:border-gray-800">
      {row?.importError ? (
        <p className="mb-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{row.importError}</p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-6">
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-500">Category</label>
          <CategoryPicker
            value={categoryValue}
            onSelect={(category) => {
              setValue(`rows.${index}.categoryId`, category.id);
              setValue(`rows.${index}.categoryName`, category.name);
              setValue(`rows.${index}.modelId`, "");
              setValue(`rows.${index}.modelName`, "");
            }}
          />
          {rowErrors?.categoryId ? <p className="mt-1 text-xs text-danger">{rowErrors.categoryId.message}</p> : null}
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-500">Model</label>
          <ModelPicker
            categoryId={row?.categoryId || null}
            value={modelValue}
            onSelect={(model) => {
              setValue(`rows.${index}.modelId`, model.id);
              setValue(`rows.${index}.modelName`, model.name);
            }}
          />
          {rowErrors?.modelId ? <p className="mt-1 text-xs text-danger">{rowErrors.modelId.message}</p> : null}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Qty</label>
          <input
            type="number"
            {...register(`rows.${index}.quantity`, { valueAsNumber: true })}
            className="w-full rounded-xl border border-gray-200 px-2 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
          />
          {rowErrors?.quantity ? <p className="mt-1 text-xs text-danger">{rowErrors.quantity.message}</p> : null}
        </div>
        <div className="flex items-end justify-end md:col-span-1">
          <button
            type="button"
            onClick={onRemove}
            disabled={!canRemove}
            className="rounded-full p-2 text-gray-400 hover:bg-danger/10 hover:text-danger disabled:opacity-30"
            aria-label="Remove row"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Buying price</label>
          <input
            type="number"
            {...register(`rows.${index}.buyingPrice`, { valueAsNumber: true })}
            className="w-full rounded-xl border border-gray-200 px-2 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
          />
          {rowErrors?.buyingPrice ? <p className="mt-1 text-xs text-danger">{rowErrors.buyingPrice.message}</p> : null}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Min selling price</label>
          <input
            type="number"
            {...register(`rows.${index}.minSellingPrice`, { valueAsNumber: true })}
            className="w-full rounded-xl border border-gray-200 px-2 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
          />
          {rowErrors?.minSellingPrice ? (
            <p className="mt-1 text-xs text-danger">{rowErrors.minSellingPrice.message}</p>
          ) : null}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Max selling price</label>
          <input
            type="number"
            {...register(`rows.${index}.maxSellingPrice`, { valueAsNumber: true })}
            className="w-full rounded-xl border border-gray-200 px-2 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
          />
          {rowErrors?.maxSellingPrice ? (
            <p className="mt-1 text-xs text-danger">{rowErrors.maxSellingPrice.message}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const editSchema = z
  .object({
    categoryId: z.string().min(1, "Pick a category"),
    categoryName: z.string(),
    modelId: z.string().min(1, "Pick a model"),
    modelName: z.string(),
    quantity: z.number({ invalid_type_error: "Required" }).int().positive("Must be > 0"),
    buyingPrice: z.number({ invalid_type_error: "Required" }).positive("Must be > 0"),
    minSellingPrice: z.number({ invalid_type_error: "Required" }).positive("Must be > 0"),
    maxSellingPrice: z.number({ invalid_type_error: "Required" }).positive("Must be > 0"),
  })
  .refine((row) => row.maxSellingPrice >= row.minSellingPrice, {
    message: "Max must be ≥ min",
    path: ["maxSellingPrice"],
  });

type EditFormValues = z.infer<typeof editSchema>;

interface EditStockItemModalProps {
  item: StockItem;
  onClose: () => void;
  onSaved: () => void;
}

function EditStockItemModal({ item, onClose, onSaved }: EditStockItemModalProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      categoryId: item.category,
      categoryName: item.categoryName,
      modelId: item.model,
      modelName: item.modelName,
      quantity: item.quantity,
      buyingPrice: item.buyingPrice,
      minSellingPrice: item.minSellingPrice,
      maxSellingPrice: item.maxSellingPrice,
    },
  });
  const categoryId = useWatch({ control, name: "categoryId" });
  const categoryName = useWatch({ control, name: "categoryName" });
  const modelId = useWatch({ control, name: "modelId" });
  const modelName = useWatch({ control, name: "modelName" });

  const categoryValue: Category | null = categoryId ? { id: categoryId, name: categoryName, createdAt: "" } : null;
  const modelValue: PhoneModel | null = modelId ? { id: modelId, category: categoryId, name: modelName, createdAt: "" } : null;

  const onSubmit = async (values: EditFormValues) => {
    setServerError(null);
    try {
      await updateStockItem(item.id, {
        category: values.categoryId,
        model: values.modelId,
        quantity: values.quantity,
        buyingPrice: values.buyingPrice,
        minSellingPrice: values.minSellingPrice,
        maxSellingPrice: values.maxSellingPrice,
      });
      onSaved();
      onClose();
    } catch (err) {
      setServerError(extractErrorMessage(err, "Unable to save these changes"));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit stock item</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {serverError ? <p className="mb-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{serverError}</p> : null}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Category</label>
              <CategoryPicker
                value={categoryValue}
                onSelect={(category) => {
                  setValue("categoryId", category.id);
                  setValue("categoryName", category.name);
                  setValue("modelId", "");
                  setValue("modelName", "");
                }}
              />
              {errors.categoryId ? <p className="mt-1 text-xs text-danger">{errors.categoryId.message}</p> : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Model</label>
              <ModelPicker
                categoryId={categoryId || null}
                value={modelValue}
                onSelect={(model) => {
                  setValue("modelId", model.id);
                  setValue("modelName", model.name);
                }}
              />
              {errors.modelId ? <p className="mt-1 text-xs text-danger">{errors.modelId.message}</p> : null}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Quantity</label>
              <input
                type="number"
                {...register("quantity", { valueAsNumber: true })}
                className="w-full rounded-xl border border-gray-200 px-2 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
              />
              {errors.quantity ? <p className="mt-1 text-xs text-danger">{errors.quantity.message}</p> : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Buying price</label>
              <input
                type="number"
                {...register("buyingPrice", { valueAsNumber: true })}
                className="w-full rounded-xl border border-gray-200 px-2 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
              />
              {errors.buyingPrice ? <p className="mt-1 text-xs text-danger">{errors.buyingPrice.message}</p> : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Min selling price</label>
              <input
                type="number"
                {...register("minSellingPrice", { valueAsNumber: true })}
                className="w-full rounded-xl border border-gray-200 px-2 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
              />
              {errors.minSellingPrice ? <p className="mt-1 text-xs text-danger">{errors.minSellingPrice.message}</p> : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Max selling price</label>
              <input
                type="number"
                {...register("maxSellingPrice", { valueAsNumber: true })}
                className="w-full rounded-xl border border-gray-200 px-2 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
              />
              {errors.maxSellingPrice ? <p className="mt-1 text-xs text-danger">{errors.maxSellingPrice.message}</p> : null}
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Remaining quantity ({item.quantityRemaining}) isn't editable here — it only changes as units sell.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 dark:border-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function StockPage() {
  const { has } = usePermissions();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [recentItems, setRecentItems] = useState<StockItem[]>([]);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canEdit = has("edit_stock");

  const {
    control,
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      supplierId: "",
      supplierName: "",
      importDate: new Date().toISOString().slice(0, 10),
      invoiceNumber: "",
      notes: "",
      rows: [blankRow],
    },
  });
  const { fields, append, remove, replace } = useFieldArray({ control, name: "rows" });
  const supplierId = useWatch({ control, name: "supplierId" });
  const supplierName = useWatch({ control, name: "supplierName" });

  const loadRecentItems = () => {
    listRecentStockItems()
      .then(setRecentItems)
      .catch(() => setServerError("Unable to load recent stock"));
  };

  useEffect(() => {
    loadRecentItems();
  }, []);

  const supplierValue: Supplier | null = supplierId
    ? { id: supplierId, name: supplierName, phone: "", address: "", email: "", notes: "", createdAt: "" }
    : null;

  const handleImportClick = () => fileInputRef.current?.click();

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    setServerError(null);
    try {
      await downloadStockImportTemplate();
    } catch {
      setServerError("Unable to download the import template");
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    setServerError(null);
    try {
      const rows = await importStockExcel(file);
      const mapped = rows.map((row) => ({
        categoryId: row.category?.id ?? "",
        categoryName: row.category?.name ?? "",
        modelId: row.model?.id ?? "",
        modelName: row.model?.name ?? "",
        quantity: row.quantity ?? 0,
        buyingPrice: row.buyingPrice ?? 0,
        minSellingPrice: row.minSellingPrice ?? 0,
        maxSellingPrice: row.maxSellingPrice ?? 0,
        importError: row.error,
      }));
      replace(mapped);
    } catch (err) {
      setServerError(extractErrorMessage(err, "Unable to import this file"));
    } finally {
      setImporting(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    setSuccessMessage(null);
    try {
      await createStockIn({
        supplier: values.supplierId,
        importDate: values.importDate,
        invoiceNumber: values.invoiceNumber,
        notes: values.notes,
        items: values.rows.map((row) => ({
          category: row.categoryId,
          model: row.modelId,
          quantity: row.quantity,
          buyingPrice: row.buyingPrice,
          minSellingPrice: row.minSellingPrice,
          maxSellingPrice: row.maxSellingPrice,
        })),
      });
      setSuccessMessage("Stock batch saved");
      reset({
        supplierId: "",
        supplierName: "",
        importDate: new Date().toISOString().slice(0, 10),
        invoiceNumber: "",
        notes: "",
        rows: [blankRow],
      });
      loadRecentItems();
    } catch (err) {
      setServerError(extractErrorMessage(err, "Unable to save this batch"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Stock intake</h1>
          <p className="text-sm text-gray-400">
            Multi-row inventory imports with supplier and pricing control
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleDownloadTemplate()}
            disabled={downloadingTemplate}
            className="flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Download size={16} />
            {downloadingTemplate ? "Preparing…" : "Download to Excel"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => void handleFileChange(e)}
          />
          <button
            type="button"
            onClick={handleImportClick}
            disabled={importing}
            className="flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Upload size={16} />
            {importing ? "Importing…" : "Import from Excel"}
          </button>
        </div>
      </div>

      {serverError ? <div className="card p-4 text-sm text-danger">{serverError}</div> : null}
      {successMessage ? <div className="card p-4 text-sm text-success">{successMessage}</div> : null}

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4 p-6">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Supplier</label>
            <SupplierPicker
              value={supplierValue}
              onSelect={(supplier) => {
                setValue("supplierId", supplier.id);
                setValue("supplierName", supplier.name);
              }}
            />
            {errors.supplierId ? <p className="mt-1 text-xs text-danger">{errors.supplierId.message}</p> : null}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Import date</label>
            <input
              type="date"
              {...register("importDate")}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Invoice number</label>
            <input
              {...register("invoiceNumber")}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Notes</label>
            <input
              {...register("notes")}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
            />
          </div>
        </div>

        <div className="space-y-3">
          {fields.map((field, index) => (
            <StockRow
              key={field.id}
              index={index}
              control={control}
              register={register}
              setValue={setValue}
              errors={errors}
              onRemove={() => remove(index)}
              canRemove={fields.length > 1}
            />
          ))}
        </div>
        {errors.rows?.message ? <p className="text-xs text-danger">{errors.rows.message}</p> : null}

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => append(blankRow)}
            className="flex items-center gap-2 rounded-2xl border border-dashed border-gray-300 px-4 py-2 text-sm font-medium text-gray-500 hover:border-primary hover:text-primary dark:border-gray-700"
          >
            <Plus size={16} />
            Add row
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? "Saving…" : "Save batch"}
          </button>
        </div>
      </form>

      <div className="card overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-950">
            <tr>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Model</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Buying price</th>
              <th className="px-4 py-3">Status</th>
              {canEdit ? <th className="px-4 py-3" /> : null}
            </tr>
          </thead>
          <tbody>
            {recentItems.map((item) => {
              const status = stockStatus(item.quantityRemaining);
              return (
                <tr key={item.id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-3">{item.supplierName}</td>
                  <td className="px-4 py-3">{item.categoryName}</td>
                  <td className="px-4 py-3">{item.modelName}</td>
                  <td className="px-4 py-3">{item.quantityRemaining}</td>
                  <td className="px-4 py-3">TZS {currency(item.buyingPrice)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                  {canEdit ? (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setEditingItem(item)}
                        className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {recentItems.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 7 : 6} className="px-4 py-8 text-center text-sm text-gray-400">
                  No stock recorded yet
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {editingItem ? (
        <EditStockItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={loadRecentItems}
        />
      ) : null}
    </div>
  );
}
