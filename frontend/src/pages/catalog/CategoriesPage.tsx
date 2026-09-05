import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Tag, Trash2 } from "lucide-react";
import { CategoryPicker } from "../../components/CategoryPicker";
import { ModelPicker } from "../../components/ModelPicker";
import { deleteCategory, deleteModel, searchCategories, searchModels } from "../../services/catalog";
import { extractErrorMessage } from "../../lib/errors";
import type { Category, PhoneModel } from "../../types";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [modelsByCategory, setModelsByCategory] = useState<Record<string, PhoneModel[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCategories = () => {
    searchCategories("")
      .then(setCategories)
      .catch(() => setError("Unable to load categories"));
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const loadModels = (categoryId: string) => {
    searchModels(categoryId, "")
      .then((models) => setModelsByCategory((prev) => ({ ...prev, [categoryId]: models })))
      .catch(() => setError("Unable to load models"));
  };

  const toggleExpand = (category: Category) => {
    if (expanded === category.id) {
      setExpanded(null);
      return;
    }
    setExpanded(category.id);
    if (!modelsByCategory[category.id]) loadModels(category.id);
  };

  const handleCategoryCreated = (category: Category) => {
    setError(null);
    setCategories((prev) =>
      prev.some((c) => c.id === category.id)
        ? prev
        : [...prev, category].sort((a, b) => a.name.localeCompare(b.name)),
    );
  };

  const handleModelCreated = (categoryId: string, model: PhoneModel) => {
    setError(null);
    setModelsByCategory((prev) => {
      const existing = prev[categoryId] ?? [];
      if (existing.some((m) => m.id === model.id)) return prev;
      return { ...prev, [categoryId]: [...existing, model].sort((a, b) => a.name.localeCompare(b.name)) };
    });
  };

  const handleDeleteCategory = async (category: Category) => {
    try {
      await deleteCategory(category.id);
      setCategories((prev) => prev.filter((c) => c.id !== category.id));
    } catch (err) {
      setError(extractErrorMessage(err, "Unable to delete this category"));
    }
  };

  const handleDeleteModel = async (categoryId: string, model: PhoneModel) => {
    try {
      await deleteModel(model.id);
      setModelsByCategory((prev) => ({
        ...prev,
        [categoryId]: (prev[categoryId] ?? []).filter((m) => m.id !== model.id),
      }));
    } catch (err) {
      setError(extractErrorMessage(err, "Unable to delete this model"));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Categories &amp; models</h1>
        <p className="text-sm text-gray-400">
          Brands and the phone models under them — search or type a new name to create it
        </p>
      </div>

      {error ? <div className="card p-4 text-sm text-danger">{error}</div> : null}

      <div className="card p-4">
        <p className="mb-2 text-sm font-medium">Add a category</p>
        <div className="max-w-sm">
          <CategoryPicker value={null} onSelect={handleCategoryCreated} />
        </div>
      </div>

      <div className="card divide-y divide-gray-100 overflow-hidden dark:divide-gray-800">
        {categories.map((category) => (
          <div key={category.id}>
            <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800">
              <button
                type="button"
                onClick={() => toggleExpand(category)}
                className="flex flex-1 items-center gap-2 text-left text-sm font-medium"
              >
                {expanded === category.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <Tag size={14} className="text-primary" />
                {category.name}
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteCategory(category)}
                className="rounded-full p-1.5 text-gray-400 hover:bg-danger/10 hover:text-danger"
                aria-label={`Delete ${category.name}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
            {expanded === category.id ? (
              <div className="space-y-3 bg-background px-4 py-4 dark:bg-gray-950">
                <div className="max-w-sm">
                  <ModelPicker
                    categoryId={category.id}
                    value={null}
                    onSelect={(model) => handleModelCreated(category.id, model)}
                  />
                </div>
                <ul className="space-y-1">
                  {(modelsByCategory[category.id] ?? []).map((model) => (
                    <li
                      key={model.id}
                      className="flex items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-white dark:hover:bg-gray-900"
                    >
                      {model.name}
                      <button
                        type="button"
                        onClick={() => void handleDeleteModel(category.id, model)}
                        className="rounded-full p-1 text-gray-400 hover:bg-danger/10 hover:text-danger"
                        aria-label={`Delete ${model.name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </li>
                  ))}
                  {(modelsByCategory[category.id] ?? []).length === 0 ? (
                    <li className="px-3 py-2 text-sm text-gray-400">No models yet</li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </div>
        ))}
        {categories.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">No categories yet</div>
        ) : null}
      </div>
    </div>
  );
}
