import { useState } from "react";
import Layout from "./components/Layout.js";
import Dashboard from "./views/Dashboard.js";
import CrawlJobs from "./views/CrawlJobs.js";
import JobDetail from "./views/JobDetail.js";
import Pages from "./views/Pages.js";
import PageDetail from "./views/PageDetail.js";
import Search from "./views/Search.js";
import Ask from "./views/Ask.js";
import Workers from "./views/Workers.js";
import "./App.css";

export type ViewState =
  | { name: "dashboard" }
  | { name: "crawl" }
  | { name: "job-detail"; params: { jobId: string } }
  | { name: "pages" }
  | { name: "page-detail"; params: { pageId: string } }
  | { name: "search" }
  | { name: "ask" }
  | { name: "workers" };

function App() {
  const [view, setView] = useState<ViewState>({ name: "dashboard" });

  const navigate = (name: string) => {
    const target = name as ViewState["name"];
    setView({ name: target } as ViewState);
  };

  const renderView = () => {
    switch (view.name) {
      case "dashboard":
        return (
          <Dashboard
            onNavigate={(v: string) => {
              if (v === "crawl") setView({ name: "crawl" });
              else if (v === "ask") setView({ name: "ask" });
            }}
          />
        );
      case "crawl":
        return <CrawlJobs onNavigate={(v) => setView(v as ViewState)} />;
      case "job-detail":
        return (
          <JobDetail
            jobId={view.params.jobId}
            onBack={() => setView({ name: "crawl" })}
            onNavigate={(v) => setView(v as ViewState)}
          />
        );
      case "pages":
        return <Pages onNavigate={(v) => setView(v as ViewState)} />;
      case "page-detail":
        return (
          <PageDetail
            pageId={view.params.pageId}
            onBack={() => setView({ name: "pages" })}
          />
        );
      case "search":
        return <Search onNavigate={(v) => setView(v as ViewState)} />;
      case "ask":
        return <Ask />;
      case "workers":
        return <Workers />;
    }
  };

  return (
    <Layout activeView={view.name} onNavigate={navigate}>
      {renderView()}
    </Layout>
  );
}

export default App;
