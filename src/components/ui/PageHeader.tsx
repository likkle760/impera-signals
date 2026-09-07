"use client";

interface PageHeaderProps {
  eyebrow?: string;
  eyebrowIcon?: React.ReactNode;
  title: string;
  highlight?: string;
  description?: string;
  right?: React.ReactNode;
}

export function PageHeader({ eyebrow, eyebrowIcon, title, highlight, description, right }: PageHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl panel border-terminal-border/50 p-6 sm:p-8">
      <div className="absolute inset-0 hero-grid" />
      <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-terminal-accent/10 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-terminal-violet/10 blur-3xl" />
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
        <div>
          {eyebrow && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-terminal-accentBg border border-terminal-accent/30 text-terminal-accent text-caption font-semibold mb-4">
              {eyebrowIcon}
              {eyebrow}
            </div>
          )}
          <h1 className="font-display text-display-md sm:text-display-lg font-bold tracking-tight">
            {title}{" "}
            {highlight && <span className="aurora-text">{highlight}</span>}
          </h1>
          {description && <p className="text-terminal-muted mt-2 max-w-xl">{description}</p>}
        </div>
        {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
      </div>
    </div>
  );
}