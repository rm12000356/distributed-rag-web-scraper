import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { cleanHtml } from "./cleaner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadFixture(name: string): string {
  return readFileSync(resolve(__dirname, "../test-fixtures", name), "utf-8");
}

describe("cleanHtml", () => {
  it("extracts title from <title> tag", () => {
    const result = cleanHtml("<html><head><title>Test Page</title></head><body><p>Hello</p></body></html>");
    expect(result.title).toBe("Test Page");
  });

  it("extracts language from html lang attribute", () => {
    const result = cleanHtml('<html lang="fr"><head><title>Bonjour</title></head><body><p>Salut</p></body></html>');
    expect(result.language).toBe("fr");
  });

  it("extracts language from meta content-language", () => {
    const result = cleanHtml('<html><head><meta http-equiv="content-language" content="de"><title>Hallo</title></head><body><p>Hallo</p></body></html>');
    expect(result.language).toBe("de");
  });

  it("returns null language when not present", () => {
    const result = cleanHtml("<html><head><title>No Lang</title></head><body><p>Hi</p></body></html>");
    expect(result.language).toBeNull();
  });

  it("removes script, style, noscript, iframe", () => {
    const html = `<html><body>
      <script>alert('xss')</script>
      <style>.cls{}</style>
      <noscript>No JS</noscript>
      <iframe src="ad.html"></iframe>
      <p>Keep this</p>
    </body></html>`;
    const result = cleanHtml(html);
    expect(result.cleanedText).not.toContain("alert");
    expect(result.cleanedText).not.toContain(".cls");
    expect(result.cleanedText).not.toContain("No JS");
    expect(result.cleanedText).toContain("Keep this");
  });

  it("removes nav, header, footer, aside", () => {
    const html = `<html><body>
      <header>Header</header>
      <nav>Nav</nav>
      <main><p>Content</p></main>
      <aside>Sidebar</aside>
      <footer>Footer</footer>
    </body></html>`;
    const result = cleanHtml(html);
    expect(result.cleanedText).not.toContain("Header");
    expect(result.cleanedText).not.toContain("Nav");
    expect(result.cleanedText).not.toContain("Sidebar");
    expect(result.cleanedText).not.toContain("Footer");
    expect(result.cleanedText).toContain("Content");
  });

  it("removes elements with role=navigation, role=banner, role=contentinfo", () => {
    const html = `<html><body>
      <div role="navigation">Nav</div>
      <div role="banner">Banner</div>
      <div role="contentinfo">Info</div>
      <main><p>Main</p></main>
    </body></html>`;
    const result = cleanHtml(html);
    expect(result.cleanedText).not.toContain("Nav");
    expect(result.cleanedText).not.toContain("Banner");
    expect(result.cleanedText).not.toContain("Info");
    expect(result.cleanedText).toContain("Main");
  });

  it("removes elements with sidebar/nav/footer/header/menu class", () => {
    const html = `<html><body>
      <div class="sidebar">Side</div>
      <div class="nav">Nav</div>
      <div class="menu">Menu</div>
      <main><p>Content</p></main>
    </body></html>`;
    const result = cleanHtml(html);
    expect(result.cleanedText).not.toContain("Side");
    expect(result.cleanedText).not.toContain("Nav");
    expect(result.cleanedText).not.toContain("Menu");
    expect(result.cleanedText).toContain("Content");
  });

  it("removes advertisement and cookie-banner elements", () => {
    const html = `<html><body>
      <div class="advertisement">Buy now</div>
      <div class="ad">Special offer</div>
      <div class="cookie-banner">Accept cookies</div>
      <main><p>Real content</p></main>
    </body></html>`;
    const result = cleanHtml(html);
    expect(result.cleanedText).not.toContain("Buy now");
    expect(result.cleanedText).not.toContain("Special offer");
    expect(result.cleanedText).not.toContain("Accept cookies");
    expect(result.cleanedText).toContain("Real content");
  });

  it("removes social-share, comments, related-posts, breadcrumb", () => {
    const html = `<html><body>
      <div class="social-share">Share</div>
      <div class="comments">Comments</div>
      <div class="related-posts">Related</div>
      <div class="breadcrumb">Home > Page</div>
      <main><p>Content</p></main>
    </body></html>`;
    const result = cleanHtml(html);
    expect(result.cleanedText).not.toContain("Share");
    expect(result.cleanedText).not.toContain("Comments");
    expect(result.cleanedText).not.toContain("Related");
    expect(result.cleanedText).not.toContain("Home > Page");
    expect(result.cleanedText).toContain("Content");
  });

  it("removes hidden elements", () => {
    const html = `<html><body>
      <div hidden>Hidden</div>
      <div aria-hidden="true">Aria hidden</div>
      <div style="display:none">Display none</div>
      <main><p>Visible</p></main>
    </body></html>`;
    const result = cleanHtml(html);
    expect(result.cleanedText).not.toContain("Hidden");
    expect(result.cleanedText).not.toContain("Aria hidden");
    expect(result.cleanedText).not.toContain("Display none");
    expect(result.cleanedText).toContain("Visible");
  });

  it("prefers main over body for content", () => {
    const html = `<html><body>
      <div>Outside main</div>
      <main><p>Inside main</p></main>
    </body></html>`;
    const result = cleanHtml(html);
    expect(result.cleanedText).toContain("Inside main");
    expect(result.cleanedText).not.toContain("Outside main");
  });

  it("prefers article over body when main absent", () => {
    const html = `<html><body>
      <div>Outside</div>
      <article><p>Article content</p></article>
    </body></html>`;
    const result = cleanHtml(html);
    expect(result.cleanedText).toContain("Article content");
    expect(result.cleanedText).not.toContain("Outside");
  });

  it("preserves semantic block elements in order", () => {
    const html = `<html><body><main>
      <h1>Title</h1>
      <p>First paragraph</p>
      <h2>Subtitle</h2>
      <p>Second paragraph</p>
      <ul><li>Item 1</li><li>Item 2</li></ul>
    </main></body></html>`;
    const result = cleanHtml(html);
    expect(result.cleanedText).toContain("Title");
    expect(result.cleanedText).toContain("First paragraph");
    expect(result.cleanedText).toContain("Subtitle");
    expect(result.cleanedText).toContain("Second paragraph");
    expect(result.cleanedText).toContain("Item 1");
    expect(result.cleanedText).toContain("Item 2");

    const titlePos = result.cleanedText.indexOf("Title");
    const firstParaPos = result.cleanedText.indexOf("First paragraph");
    expect(firstParaPos).toBeGreaterThan(titlePos);
  });

  it("removes boilerplate phrases", () => {
    const html = `<html><body><main>
      <p>Real content here.</p>
      <p>Accept cookies to continue.</p>
      <p>Subscribe to our newsletter for updates.</p>
    </main></body></html>`;
    const result = cleanHtml(html);
    expect(result.cleanedText).toContain("Real content here.");
    expect(result.cleanedText).not.toContain("Accept cookies");
    expect(result.cleanedText).not.toContain("Subscribe to our newsletter");
  });

  it("accepts custom boilerplate phrases", () => {
    const html = `<html><body><main>
      <p>Real content.</p>
      <p>Custom spam phrase here.</p>
    </main></body></html>`;
    const result = cleanHtml(html, ["Custom spam phrase"]);
    expect(result.cleanedText).not.toContain("Custom spam phrase");
  });

  it("normalizes whitespace", () => {
    const html = `<html><body><main>
      <p>Hello    world</p>
      <p>Line1</p>
      <p>Line2</p>
    </main></body></html>`;
    const result = cleanHtml(html);
    expect(result.cleanedText).not.toMatch(/ {3,}/);
    expect(result.cleanedText).toMatch(/Hello world/);
  });

  it("processes realistic sample article", () => {
    const html = loadFixture("sample-article.html");
    const result = cleanHtml(html);
    expect(result.title).toBe("Breaking News: Mars Mission Discovers Ancient Water — Space Times");
    expect(result.language).toBe("en");
    expect(result.cleanedText).toContain("Mars Mission Discovers Ancient Water");
    expect(result.cleanedText).toContain("groundbreaking discovery");
    expect(result.cleanedText).toContain("Jezero Crater");
    expect(result.cleanedText).toContain("Sarah Chen");

    expect(result.cleanedText).not.toMatch(/Accept cookies/i);
    expect(result.cleanedText).not.toMatch(/Buy Your Telescope/i);
    expect(result.cleanedText).not.toMatch(/Sponsored Content/i);
    expect(result.cleanedText).not.toMatch(/Comments/i);
    expect(result.cleanedText).not.toMatch(/Related Articles/i);
    expect(result.cleanedText).not.toMatch(/Space Times.{0,5}All rights reserved/i);
    expect(result.cleanedText).not.toMatch(/console\.log/i);

    expect(result.cleanedText).toContain("Radar detection depth");
    expect(result.cleanedText).toContain("Estimated age");
  });

  it("handles empty HTML", () => {
    const result = cleanHtml("<html><head></head><body></body></html>");
    expect(result.title).toBe("");
    expect(result.cleanedText).toBe("");
    expect(result.language).toBeNull();
  });
});
