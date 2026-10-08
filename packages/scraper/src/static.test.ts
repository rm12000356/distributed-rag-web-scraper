import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchStatic, FetchError } from "./static.js";

vi.mock("axios", () => {
  const mockAxios = {
    get: vi.fn(),
  };
  return {
    default: mockAxios,
    isAxiosError: (err: unknown) => (err as { isAxios?: boolean })?.isAxios === true,
    AxiosError: class {
      code: string | undefined;
      message: string;
      response: Record<string, unknown> | undefined;
      isAxios: boolean;
      constructor(msg: string, code?: string, response?: Record<string, unknown>) {
        this.message = msg;
        this.code = code;
        this.response = response;
        this.isAxios = true;
      }
    },
  };
});

import axios from "axios";

const mockGet = axios.get as ReturnType<typeof vi.fn>;

function makeResponse(overrides: Record<string, unknown> = {}) {
  return {
    status: 200,
    statusText: "OK",
    data: "<html><body><p>Hello</p></body></html>",
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-custom": "value",
    },
    ...overrides,
  };
}

describe("fetchStatic", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("fetches HTML and returns StaticFetchResult", async () => {
    mockGet.mockResolvedValue(makeResponse());

    const result = await fetchStatic("https://example.com");

    expect(result.$).toBeDefined();
    expect(result.statusCode).toBe(200);
    expect(result.headers["x-custom"]).toBe("value");
  });

  it("rejects non-HTTP protocols", async () => {
    await expect(fetchStatic("ftp://example.com")).rejects.toThrow(FetchError);
    await expect(fetchStatic("ftp://example.com")).rejects.toMatchObject({ code: "INVALID_URL" });
  });

  it("rejects invalid URLs", async () => {
    await expect(fetchStatic("not a url")).rejects.toThrow(FetchError);
    await expect(fetchStatic("not a url")).rejects.toMatchObject({ code: "INVALID_URL" });
  });

  it("rejects non-HTML content types", async () => {
    mockGet.mockResolvedValue(makeResponse({ headers: { "content-type": "application/pdf" } }));

    await expect(fetchStatic("https://example.com/file.pdf")).rejects.toThrow(FetchError);
    await expect(fetchStatic("https://example.com/file.pdf")).rejects.toMatchObject({ code: "NOT_HTML" });
  });

  it("handles HTTP 4xx responses as errors", async () => {
    const axiosErr = Object.assign(new Error("Request failed with status code 404"), {
      isAxios: true,
      code: "ERR_BAD_REQUEST",
      response: { status: 404, statusText: "Not Found" },
    });
    mockGet.mockRejectedValue(axiosErr);

    await expect(fetchStatic("https://example.com/404")).rejects.toThrow(FetchError);
    await expect(fetchStatic("https://example.com/404")).rejects.toMatchObject({ code: "HTTP_ERROR", statusCode: 404 });
  });
});
