import { describe, it, expect } from "vitest";
import * as cheerio from "cheerio";
import { extract } from "./extractor.js";

function load(html: string) {
  return cheerio.load(html);
}

describe("extract", () => {
  it("extracts title", () => {
    const $ = load("<html><head><title>Test Page</title></head><body></body></html>");
    const result = extract($, "https://example.com");
    expect(result.title).toBe("Test Page");
  });

  it("extracts description from meta tag", () => {
    const $ = load('<html><head><meta name="description" content="A test page"></head><body></body></html>');
    const result = extract($, "https://example.com");
    expect(result.description).toBe("A test page");
  });

  it("extracts metadata from meta tags", () => {
    const $ = load('<html><head><meta name="keywords" content="test,example"><meta name="author" content="Me"></head><body></body></html>');
    const result = extract($, "https://example.com");
    expect(result.metadata["keywords"]).toBe("test,example");
    expect(result.metadata["author"]).toBe("Me");
  });

  it("extracts OpenGraph tags", () => {
    const $ = load('<html><head><meta property="og:title" content="OG Title"><meta property="og:image" content="https://example.com/img.jpg"></head><body></body></html>');
    const result = extract($, "https://example.com");
    expect(result.ogTags["og:title"]).toBe("OG Title");
    expect(result.ogTags["og:image"]).toBe("https://example.com/img.jpg");
  });

  it("extracts links and resolves relative URLs", () => {
    const $ = load('<html><body><a href="/about">About</a><a href="https://other.com">Other</a></body></html>');
    const result = extract($, "https://example.com");
    expect(result.links).toContain("https://example.com/about");
    expect(result.links).toContain("https://other.com/");
  });

  it("filters mailto: links", () => {
    const $ = load('<html><body><a href="mailto:test@example.com">Email</a></body></html>');
    const result = extract($, "https://example.com");
    expect(result.links).not.toContain("mailto:test@example.com");
  });

  it("filters javascript: links", () => {
    const $ = load('<html><body><a href="javascript:void(0)">JS</a></body></html>');
    const result = extract($, "https://example.com");
    expect(result.links).toEqual([]);
  });

  it("filters anchor-only links", () => {
    const $ = load('<html><body><a href="#section">Section</a><a href="#">Top</a></body></html>');
    const result = extract($, "https://example.com");
    expect(result.links).toEqual([]);
  });

  it("removes duplicate links", () => {
    const $ = load('<html><body><a href="/about">About</a><a href="/about">About again</a></body></html>');
    const result = extract($, "https://example.com");
    expect(result.links.filter((l) => l === "https://example.com/about").length).toBe(1);
  });

  it("extracts text content from body", () => {
    const $ = load("<html><body><p>Hello world</p></body></html>");
    const result = extract($, "https://example.com");
    expect(result.textContent).toContain("Hello world");
  });

  it("prefers main over body", () => {
    const $ = load("<html><body><main>Main content</main><div>Footer text</div></body></html>");
    const result = extract($, "https://example.com");
    expect(result.textContent).toBe("Main content");
  });

  it("prefers span.text over article when main absent", () => {
    const $ = load('<html><body><span class="text">Span text content</span><article>Article content</article></body></html>');
    const result = extract($, "https://example.com");
    expect(result.textContent).toBe("Span text content");
  });

  it("concatenates multiple span.text elements", () => {
    const $ = load('<html><body><span class="text">First</span><span class="text">Second</span><article>Article</article></body></html>');
    const result = extract($, "https://example.com");
    expect(result.textContent).toContain("First");
    expect(result.textContent).toContain("Second");
  });

  it("prefers article over body when main and span.text absent", () => {
    const $ = load("<html><body><article>Article content</article><div>Sidebar</div></body></html>");
    const result = extract($, "https://example.com");
    expect(result.textContent).toBe("Article content");
  });

  it("removes script and style tags from text content", () => {
    const $ = load("<html><body><p>Hello</p><script>alert('hi')</script><style>.cls{}</style></body></html>");
    const result = extract($, "https://example.com");
    expect(result.textContent).not.toContain("alert");
    expect(result.textContent).not.toContain(".cls");
  });

  it("removes nav, header, footer, aside from text content", () => {
    const $ = load("<html><body><main><nav>Nav</nav><header>Header</header><p>Content</p><footer>Footer</footer><aside>Aside</aside></main></body></html>");
    const result = extract($, "https://example.com");
    expect(result.textContent).not.toContain("Nav");
    expect(result.textContent).not.toContain("Header");
    expect(result.textContent).not.toContain("Footer");
    expect(result.textContent).not.toContain("Aside");
    expect(result.textContent).toContain("Content");
  });

  it("normalizes whitespace in text content", () => {
    const $ = load("<html><body><p>Hello    world\n\n\nNew paragraph</p></body></html>");
    const result = extract($, "https://example.com");
    expect(result.textContent).not.toMatch(/   /);
  });

  it("returns empty strings when no content", () => {
    const $ = load("<html><head></head><body></body></html>");
    const result = extract($, "https://example.com");
    expect(result.title).toBe("");
    expect(result.description).toBe("");
    expect(result.textContent).toBe("");
    expect(result.links).toEqual([]);
    expect(Object.keys(result.metadata).length).toBe(0);
  });
});
