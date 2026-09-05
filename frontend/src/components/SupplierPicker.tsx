import { SearchCreateCombobox } from "./SearchCreateCombobox";
import { searchSuppliers } from "../services/suppliers";
import type { Supplier } from "../types";

interface Props {
  value: Supplier | null;
  onSelect: (supplier: Supplier) => void;
}

export function SupplierPicker({ value, onSelect }: Props) {
  return (
    <SearchCreateCombobox<Supplier>
      value={value}
      onSelect={onSelect}
      search={searchSuppliers}
      placeholder="Search suppliers…"
    />
  );
}
