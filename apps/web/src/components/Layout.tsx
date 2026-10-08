import type { ReactNode } from "react";

interface LayoutProps {
  activeView: string;
  onNavigate: (view: string) => void;
  children: ReactNode;
}

const navLinks = [
  { key: "dashboard", label: "Dashboard", icon: "\u2302" },
  { key: "crawl", label: "Crawl Jobs", icon: "\u2699" },
  { key: "pages", label: "Pages", icon: "\u2630" },
  { key: "search", label: "Search", icon: "\u2315" },
  { key: "ask", label: "Ask Question", icon: "\u003F" },
  { key: "workers", label: "Workers", icon: "\u263C" },
];

export default function Layout({ activeView, onNavigate, children }: LayoutProps) {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">RAG Scraper</div>
        <ul className="sidebar-nav">
          {navLinks.map((link) => (
            <li key={link.key}>
              <a
                href="#"
                className={activeView === link.key ? "active" : ""}
                onClick={(e) => { e.preventDefault(); onNavigate(link.key); }}
              >
                <span>{link.icon}</span>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
