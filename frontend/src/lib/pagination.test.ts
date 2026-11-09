import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAll } from "./pagination";
import { api } from "../services/api";

vi.mock("../services/api", () => ({ api: { get: vi.fn() } }));

describe("fetchAll", () => {
  beforeEach(() => vi.mocked(api.get).mockReset());

  it("keeps requesting pages until there is no next page", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { results: [1, 2], next: "page2" } })
      .mockResolvedValueOnce({ data: { results: [3], next: null } });

    expect(await fetchAll<number>("/things/", { kind: "x" })).toEqual([1, 2, 3]);
    expect(api.get).toHaveBeenNthCalledWith(1, "/things/", { params: { kind: "x", page: 1, page_size: 500 } });
    expect(api.get).toHaveBeenNthCalledWith(2, "/things/", { params: { kind: "x", page: 2, page_size: 500 } });
  });

  it("returns an unpaginated list as-is", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [1, 2, 3] });
    expect(await fetchAll<number>("/things/")).toEqual([1, 2, 3]);
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
