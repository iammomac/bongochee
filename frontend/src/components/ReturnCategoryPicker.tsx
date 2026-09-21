import { SearchCreateCombobox } from "./SearchCreateCombobox";
import { getOrCreateReturnCategory, searchReturnCategories } from "../services/returns";
import type { ReturnCategory } from "../types";

interface Props {
  value: ReturnCategory | null;
  onSelect: (category: ReturnCategory) => void;
}

// Pick one of the existing kinds of fault, or type a new one and add it.
export function ReturnCategoryPicker({ value, onSelect }: Props) {
  return (
    <SearchCreateCombobox<ReturnCategory>
      value={value}
      onSelect={onSelect}
      search={searchReturnCategories}
      create={getOrCreateReturnCategory}
      placeholder="Pick or add a return category…"
    />
  );
}
