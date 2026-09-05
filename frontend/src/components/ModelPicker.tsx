import { useCallback } from "react";
import { SearchCreateCombobox } from "./SearchCreateCombobox";
import { getOrCreateModel, searchModels } from "../services/catalog";
import type { PhoneModel } from "../types";

interface Props {
  categoryId: string | null;
  value: PhoneModel | null;
  onSelect: (model: PhoneModel) => void;
}

export function ModelPicker({ categoryId, value, onSelect }: Props) {
  const search = useCallback(
    (query: string) => (categoryId ? searchModels(categoryId, query) : Promise.resolve([])),
    [categoryId],
  );
  const create = useCallback(
    (name: string) =>
      categoryId ? getOrCreateModel(categoryId, name) : Promise.reject(new Error("No category selected")),
    [categoryId],
  );

  return (
    <SearchCreateCombobox<PhoneModel>
      value={value}
      onSelect={onSelect}
      search={search}
      create={create}
      placeholder={categoryId ? "Search or create a model…" : "Select a category first"}
      disabled={!categoryId}
    />
  );
}
