import { AppHeader } from "../app-header";

export default function ProjectsLayout({ children }: LayoutProps<"/projects">) {
  return (
    <>
      <AppHeader />
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</div>
    </>
  );
}
