"use client";

import { useEffect, useRef, useState } from "react";
import { bindTextarea, getLocalDoc } from "@/lib/local/ydoc";

interface EditorProps {
  documentId: string;
  readOnly: boolean;
}

/**
 * The writing surface. It is bound directly to the local CRDT text — every
 * keystroke is an operation on the Y.Doc (the source of truth), not React
 * state. That keeps typing instant even while the sync engine works in the
 * background, and avoids re-rendering the whole document on each character.
 */
export function Editor({ documentId, readOnly }: EditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [stats, setStats] = useState({ words: 0, chars: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { text } = getLocalDoc(documentId);

    const recompute = () => {
      const value = text.toString();
      const words = value.trim() ? value.trim().split(/\s+/).length : 0;
      setStats({ words, chars: value.length });
    };

    const cleanup = bindTextarea(text, el);
    recompute();
    text.observe(recompute);

    return () => {
      cleanup();
      text.unobserve(recompute);
    };
  }, [documentId]);

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1 overflow-auto">
        <textarea
          ref={ref}
          readOnly={readOnly}
          spellCheck
          aria-label="Document body"
          placeholder={
            readOnly
              ? "You have read-only access to this document."
              : "Start writing. Everything is saved locally first — even offline."
          }
          className="writing-surface min-h-full w-full resize-none px-6 py-8 text-[15px] leading-7 text-ink outline-none placeholder:text-faint sm:px-10 md:text-base"
        />
      </div>
      <div className="flex items-center justify-end gap-4 border-t border-line bg-paper px-5 py-2 font-mono text-[11px] text-faint">
        <span>{stats.words} words</span>
        <span>{stats.chars} chars</span>
      </div>
    </div>
  );
}
