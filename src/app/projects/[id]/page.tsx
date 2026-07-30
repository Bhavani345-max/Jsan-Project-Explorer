import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Building2, MapPin, Wallet, CalendarClock, CalendarDays, ExternalLink, Hash,
  FileText, Users, Mail, Phone, Sparkles, Bookmark, BellPlus, Tag, Target, Languages,
} from "lucide-react";
import { getProject, relatedProjects } from "@/lib/repository";
import { liveDataset } from "@/lib/live";
import { Breadcrumbs, StatusBadge, SectionCard, TechChip, FitBadge } from "@/components/ui";
import { ProjectCard } from "@/components/ProjectCard";
import { money, fmtDate, deadlineLabel, daysLeft } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProjectDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { projects } = await liveDataset();
  const project = getProject(id, projects);
  if (!project) notFound();
  const related = relatedProjects(project, 4, projects);
  const dl = daysLeft(project.deadline);

  const facts: [React.ComponentType<{ size?: number; className?: string }>, string, string][] = [
    [Building2, "Organization", project.organization],
    [MapPin, "Location", project.state ? `${project.state}, ${project.country}` : project.country],
    [Wallet, "Budget", project.budgetLabel],
    [CalendarClock, "Deadline", project.deadline
      ? `${fmtDate(project.deadline)} · ${deadlineLabel(project.deadline)}`
      : "Not listed"],
    [CalendarDays, "Published", fmtDate(project.publicationDate)],
    [Hash, "Reference No.", project.referenceNumber],
    [FileText, "Source", `${project.source} (${project.sourceType})`],
    [Tag, "Category", project.category],
    [Target, "JSAN Service Line", project.serviceLine],
  ];

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Project Explorer", href: "/explorer" },
          { label: project.id },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        {/* Main */}
        <div className="space-y-6 min-w-0">
          <div className="card p-6">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="chip !bg-primary-soft !text-primary !border-transparent">{project.serviceLine}</span>
              <span className="chip">{project.category}</span>
              <span className="chip">{project.projectType}</span>
              <FitBadge score={project.fitScore} showLabel />
              <StatusBadge status={project.status} />
              {dl >= 0 && dl <= 7 && (
                <span className="chip !bg-warning-soft !text-warning !border-transparent">
                  {deadlineLabel(project.deadline)}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight leading-tight">{project.title}</h1>
            {/* These are official notices, so the published wording has to stay
                visible and citable — the English title is for reading, this is
                what the buyer actually published. */}
            {project.originalTitle !== project.title && (
              <p className="text-[13px] text-text-faint mt-2 flex items-start gap-2">
                <Languages size={14} className="shrink-0 mt-0.5" />
                <span>
                  <span className="font-semibold">Translated to English.</span>{" "}
                  <span className="italic">{project.originalTitle}</span>
                </span>
              </p>
            )}
            <p className="text-text-muted mt-2 flex items-center gap-2 text-sm">
              <Building2 size={15} /> {project.organization} · {project.country}
            </p>

            <div className="flex flex-wrap gap-2 mt-5">
              <a href={project.officialLink} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                <ExternalLink size={16} /> View Official Notice
              </a>
              <button className="btn btn-ghost">
                <Bookmark size={16} /> Save
              </button>
              <button className="btn btn-ghost">
                <BellPlus size={16} /> Alert me on changes
              </button>
            </div>
          </div>

          {/* AI summary */}
          <div className="card p-6 border-l-4" style={{ borderLeftColor: "var(--primary)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={16} className="text-primary" />
              <h2 className="font-semibold">AI Summary</h2>
              <span className="chip !text-[10px]">auto-generated</span>
            </div>
            <p className="text-[15px] leading-relaxed text-text">{project.summary}</p>
            <div className="flex flex-wrap gap-1.5 mt-4">
              {project.tags.map((t) => (
                <span key={t} className="chip !bg-bg-subtle">
                  <Tag size={11} /> {t}
                </span>
              ))}
            </div>
          </div>

          <SectionCard title="Description">
            <p className="text-[15px] leading-relaxed text-text-muted whitespace-pre-line">{project.description}</p>
          </SectionCard>

          <div className="grid sm:grid-cols-2 gap-6">
            <SectionCard title="Technologies Required" subtitle="AI-extracted from the notice">
              <div className="flex flex-wrap gap-2">
                {project.technologies.map((t) => (
                  <span key={t} className="chip !bg-primary-soft !text-primary !border-transparent">
                    {t}
                  </span>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Eligibility">
              <div className="flex gap-2.5 text-sm text-text-muted">
                <Users size={16} className="text-text-faint shrink-0 mt-0.5" />
                <p className="leading-relaxed">{project.eligibility}</p>
              </div>
            </SectionCard>
          </div>

          {project.contact && (
            <SectionCard title="Contact Information" subtitle="Publicly listed on the source notice">
              <div className="grid sm:grid-cols-3 gap-3">
                {project.contact.name && (
                  <div className="rounded-xl bg-bg-subtle p-3.5">
                    <p className="text-[11px] text-text-faint">Contact</p>
                    <p className="font-medium text-sm mt-0.5">{project.contact.name}</p>
                  </div>
                )}
                {project.contact.email && (
                  <a href={`mailto:${project.contact.email}`} className="rounded-xl bg-bg-subtle p-3.5 hover:ring-2 hover:ring-primary/30 transition">
                    <p className="text-[11px] text-text-faint flex items-center gap-1"><Mail size={11} /> Email</p>
                    <p className="font-medium text-sm mt-0.5 text-primary truncate">{project.contact.email}</p>
                  </a>
                )}
                {project.contact.phone && (
                  <div className="rounded-xl bg-bg-subtle p-3.5">
                    <p className="text-[11px] text-text-faint flex items-center gap-1"><Phone size={11} /> Phone</p>
                    <p className="font-medium text-sm mt-0.5">{project.contact.phone}</p>
                  </div>
                )}
              </div>
            </SectionCard>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <div className="card p-5 lg:sticky lg:top-20">
            <h3 className="font-semibold text-sm mb-4">Key Facts</h3>
            <dl className="space-y-3.5">
              {facts.map(([Icon, label, value]) => (
                <div key={label} className="flex gap-3">
                  <Icon size={16} className="text-text-faint shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <dt className="text-[11px] text-text-faint">{label}</dt>
                    <dd className="text-[13px] font-medium break-words">{value}</dd>
                  </div>
                </div>
              ))}
            </dl>
            <div className="mt-5 pt-4 border-t border-border">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-text-faint">Project ID</span>
                <span className="font-mono font-semibold">{project.id}</span>
              </div>
              <div className="flex items-center justify-between text-[13px] mt-2">
                <span className="text-text-faint">Industry</span>
                <span className="font-medium">{project.industry}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {related.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-primary" />
            <h2 className="font-semibold text-lg">Recommended Opportunities</h2>
            <span className="text-[13px] text-text-faint">based on technology & category match</span>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {related.map((p) => (
              <ProjectCard key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
