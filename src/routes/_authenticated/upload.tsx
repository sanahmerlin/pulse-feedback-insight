import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import Papa from "papaparse";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ingestFeedback, analyzeAndDigest } from "@/lib/feedback.functions";
import { toast } from "sonner";
import { FileUp, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({
    meta: [
      { title: "Add feedback — FeedbackPulse" },
      { name: "description", content: "Paste customer feedback or upload a CSV and let AI analyze it." },
      { property: "og:title", content: "Add feedback — FeedbackPulse" },
      { property: "og:description", content: "Paste customer feedback or upload a CSV and let AI analyze it." },
    ],
  }),
  component: UploadPage;
});

function UploadPage() {
  return null;
}
