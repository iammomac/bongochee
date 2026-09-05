import { api } from "./api";

export async function downloadBackup() {
  const res = await api.get("/system/backup/", { responseType: "blob" });
  const disposition = res.headers["content-disposition"] as string | undefined;
  const match = disposition?.match(/filename="(.+)"/);
  const filename = match?.[1] ?? `bongochee-backup-${new Date().toISOString().slice(0, 10)}.sql.gz`;

  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function restoreBackup(file: File, password: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("password", password);
  await api.post("/system/restore/", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}
