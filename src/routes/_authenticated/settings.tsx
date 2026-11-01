import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save, Sparkles, Building2, User, PhoneCall, HeartHandshake } from "lucide-react";
import { toast } from "sonner";
import { replySettingsQuery, type ReplySettings } from "@/lib/queries";
import { saveReplySettings } from "@/lib/reply.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Reply Settings — FeedbackPulse" },
      {
        name: "description",
        content: "Configure your business identity and tone for AI-written review responses.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(replySettingsQuery());
  const initialSettings = settingsQuery.data;

  const [businessName, setBusinessName] = useState("");
  const [tone, setTone] = useState<"Warm" | "Professional" | "Apologetic-but-firm">("Warm");
  const [signOff, setSignOff] = useState("Owner");
  const [contactInfo, setContactInfo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialSettings) {
      setBusinessName(initialSettings.business_name || "");
      setTone(initialSettings.tone || "Warm");
      setSignOff(initialSettings.sign_off || "Owner");
      setContactInfo(initialSettings.contact_info || "");
    }
  }, [initialSettings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!businessName.trim()) {
      toast.error("Please enter your business name.");
      return;
    }

    setSaving(true);
    const newSettings: ReplySettings = {
      business_name: businessName.trim(),
      tone,
      sign_off: signOff.trim() || "Owner",
      contact_info: contactInfo.trim(),
    };

    // Save to localStorage as immediate offline cache
    if (typeof window !== "undefined") {
      localStorage.setItem("feedback_pulse_reply_settings", JSON.stringify(newSettings));
    }

    try {
      await saveReplySettings({
        data: {
          business_name: newSettings.business_name,
          tone: newSettings.tone,
          sign_off: newSettings.sign_off,
          contact_info: newSettings.contact_info,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["reply_settings"] });
      toast.success("Reply settings saved successfully!");
    } catch (err: any) {
      console.warn("Error saving to server, cached locally:", err);
      toast.success("Settings saved locally!");
    } finally {
      setSaving(false);
    }
  }

  // Preview sample generation based on active tone
  const previewSample = getSamplePreview(tone, businessName || "Your Business", signOff || "Owner", contactInfo);

  return (
    <AppShell
      title="Reply Settings"
      description="One-time setup: customize how AI represents your business when drafting review replies."
    >
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Form settings */}
        <div className="lg:col-span-2">
          <form
            onSubmit={handleSave}
            className="rounded-xl border border-border bg-card p-6 shadow-card space-y-6"
          >
            <div>
              <h2 className="text-base font-semibold">Brand & Persona Setup</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Every AI-generated reply uses these parameters to stay authentic to your brand.
              </p>
            </div>

            {/* Business Name */}
            <div className="space-y-2">
              <Label htmlFor="business-name" className="flex items-center gap-1.5 text-xs font-semibold">
                <Building2 className="size-3.5 text-primary" />
                Business Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="business-name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Green Garden Cafe, Coastal Stay, Pulse Studio"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Appears naturally in apologies and thank-you statements.
              </p>
            </div>

            {/* Tone Selector */}
            <div className="space-y-2">
              <Label htmlFor="tone-select" className="flex items-center gap-1.5 text-xs font-semibold">
                <HeartHandshake className="size-3.5 text-primary" />
                Default Brand Tone
              </Label>
              <Select
                value={tone}
                onValueChange={(val) => setTone(val as "Warm" | "Professional" | "Apologetic-but-firm")}
              >
                <SelectTrigger id="tone-select" className="w-full">
                  <SelectValue placeholder="Choose a tone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Warm">
                    <div className="text-left">
                      <span className="font-medium">Warm</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        — Friendly, empathetic, and community-oriented
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="Professional">
                    <div className="text-left">
                      <span className="font-medium">Professional</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        — Courteous, structured, and objective
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="Apologetic-but-firm">
                    <div className="text-left">
                      <span className="font-medium">Apologetic-but-firm</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        — Respectful apology without accepting undue liability
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sign-off name */}
            <div className="space-y-2">
              <Label htmlFor="sign-off" className="flex items-center gap-1.5 text-xs font-semibold">
                <User className="size-3.5 text-primary" />
                Sign-off Signature
              </Label>
              <Input
                id="sign-off"
                value={signOff}
                onChange={(e) => setSignOff(e.target.value)}
                placeholder="e.g. Sanah, Owner or The Guest Experience Team"
              />
              <p className="text-[11px] text-muted-foreground">
                Appended at the end of each reply (e.g. &ldquo;- Sanah, Owner&rdquo;).
              </p>
            </div>

            {/* Contact info for taking offline */}
            <div className="space-y-2">
              <Label htmlFor="contact-info" className="flex items-center gap-1.5 text-xs font-semibold">
                <PhoneCall className="size-3.5 text-primary" />
                Offline Contact Email or Phone (Optional)
              </Label>
              <Input
                id="contact-info"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                placeholder="e.g. hello@greengarden.com or +91 98765 43210"
              />
              <p className="text-[11px] text-muted-foreground">
                When a customer leaves an upset review, the AI offers this contact so you can resolve it privately.
              </p>
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={saving} className="gap-2">
                <Save className="size-4" />
                {saving ? "Saving settings…" : "Save Reply Settings"}
              </Button>
            </div>
          </form>
        </div>

        {/* Live Preview Card */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-card">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Live Preview</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Here is how a reply to an unhappy review will read using your current tone:
            </p>

            <div className="rounded-lg border border-border bg-muted/30 p-3 mb-3 text-xs">
              <p className="font-medium text-foreground/70 uppercase text-[10px] tracking-wider mb-1">
                Sample Customer Review (2 Stars):
              </p>
              <p className="italic text-foreground/85 text-xs">
                &ldquo;The food tasted great but we waited over 45 minutes for our table even with a reservation.&rdquo;
              </p>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 text-xs space-y-2">
              <p className="font-semibold text-primary text-[10px] uppercase tracking-wider">
                Generated {tone} Reply:
              </p>
              <p className="text-foreground/90 leading-relaxed text-xs">
                {previewSample}
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function getSamplePreview(tone: string, businessName: string, signOff: string, contactInfo: string) {
  const contactText = contactInfo ? ` Please reach out directly to us at ${contactInfo} so we can make this right.` : "";

  if (tone === "Warm") {
    return `Thank you so much for dining with us at ${businessName} and for your honest feedback. We're glad you enjoyed the food, but we are truly sorry for the frustrating 45-minute wait despite having a reservation.${contactText} We'd love the chance to welcome you back for a seamless experience. - ${signOff}`;
  } else if (tone === "Apologetic-but-firm") {
    return `Thank you for sharing your feedback regarding your visit to ${businessName}. While we are pleased you liked the meal, we regret that table delays impacted your schedule that evening.${contactText} We hold our reservation timings to high standards and appreciate your patience as we address this. - ${signOff}`;
  } else {
    // Professional
    return `Thank you for reviewing your experience at ${businessName}. We appreciate your positive remarks on our cuisine, but apologize for the uncharacteristic delay with your reservation.${contactText} Your feedback has been shared with our floor management team to prevent recurrence. - ${signOff}`;
  }
}
