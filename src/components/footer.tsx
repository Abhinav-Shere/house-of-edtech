import { Github, Linkedin } from "lucide-react";
import { author, appName } from "@/lib/site-config";

// Required by the assignment: name, GitHub, and LinkedIn in the footer.
export function Footer() {
  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-5 py-5 text-sm text-muted sm:flex-row">
        <p>
          Built by <span className="font-medium text-ink">{author.name}</span>
          <span className="mx-2 text-faint">·</span>
          <span className="text-faint">{appName}</span>
        </p>
        <nav className="flex items-center gap-4" aria-label="Author links">
          <a
            href={author.github}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-ink"
          >
            <Github className="size-4" aria-hidden /> GitHub
          </a>
          <a
            href={author.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-ink"
          >
            <Linkedin className="size-4" aria-hidden /> LinkedIn
          </a>
        </nav>
      </div>
    </footer>
  );
}
