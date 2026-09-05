import { SearchCreateCombobox } from "./SearchCreateCombobox";
import { getOrCreateCategory, searchCategories } from "../services/catalog";
import type { Category } from "../types";

interface Props {
  value: Category | null;
  onSelect: (category: Category) => void;
}

export function CategoryPicker({ value, onSelect }: Props) {
  return (
    <SearchCreateCombobox<Category>
      value={value}
      onSelect={onSelect}
      search={searchCategories}
      create={getOrCreateCategory}
      placeholder="Search or create a category…"
    />
  );
}
