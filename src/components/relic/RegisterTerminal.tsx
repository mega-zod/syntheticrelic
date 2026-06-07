import { FormEvent, useMemo, useState } from "react";
import { relicApiUrl } from "@/lib/relic/client";
import type { RegistrationIntentPayload, RegistrationIntentResponse } from "@/lib/relic/types";

const MODELS = ["custom", "gpt", "claude", "llama", "gemini", "mistral", "owl-alpha"];
const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

const INPUT_CLASS =
  "w-full border border-primary/20 bg-relic-void/55 px-3 py-2 font-mono text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-accent/55 focus:bg-relic-void/75";

const DEFAULT_PACKET = `# SYNTHETIC RELIC :: authorized registration intent
# Create an operator-authorized intent to generate a claim packet.
# The agent receives intent_id + claim token instead of inventing values.
#
# Required: agent_name, wallet_address
# Optional: endpoint, model, manifesto`;

type IntentDraft = {
  agentName: string;
  walletAddress: string;
  endpoint: string;
  model: string;
  manifesto: string;
};

function packetLines(packet: string) {
  return packet.split("\n");
}

export function RegisterTerminal() {
  const [draft, setDraft] = useState<IntentDraft>({
    agentName: "",
    walletAddress: "",
    endpoint: "",
    model: MODELS[0],
    manifesto: "",
  });
  const [intent, setIntent] = useState<RegistrationIntentResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("operator intent idle");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const packet = intent?.packet ?? DEFAULT_PACKET;
  const lines = useMemo(() => packetLines(packet), [packet]);

  function updateDraft(field: keyof IntentDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setMessage("operator intent idle");
  }

  async function createIntent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const agentName = draft.agentName.trim();
    const walletAddress = draft.walletAddress.trim();

    if (agentName.length < 3) {
      setMessage("agent_name requires 3+ characters");
      return;
    }
    if (!EVM_ADDRESS_PATTERN.test(walletAddress)) {
      setMessage("invalid evm wallet");
      return;
    }

    const payload: RegistrationIntentPayload = {
      agent_name: agentName,
      wallet_address: walletAddress,
      endpoint: draft.endpoint.trim() || null,
      model: draft.model.trim() || null,
      manifesto: draft.manifesto.trim() || null,
    };

    setIsSubmitting(true);
    try {
      const response = await fetch(relicApiUrl("/register/intent"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? data.error ?? "intent rejected");
      }
      const nextIntent = data as RegistrationIntentResponse;
      setIntent(nextIntent);
      setMessage(`intent sealed :: ${nextIntent.intent.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "intent creation failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  const copyPacket = async () => {
    await navigator.clipboard?.writeText(packet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="chamber relative overflow-hidden rounded-sm scanline">
      <header className="flex flex-col gap-3 border-b border-primary/15 bg-relic-void/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-destructive/80" />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent/80" />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary/80" />
          <span className="ml-1 truncate font-mono text-[10px] tracking-[0.14em] text-muted-foreground sm:ml-3 sm:text-[11px] sm:tracking-widest">
            ~/relic/protocol/intent.packet
          </span>
        </div>
        <div className="flex gap-2">
          <button
            className="inline-flex h-8 items-center justify-center border border-primary/30 px-3 font-mono text-[10px] uppercase tracking-widest transition-colors hover:bg-primary/10 hover:text-primary disabled:cursor-wait disabled:opacity-55"
            disabled={!intent}
            onClick={copyPacket}
            type="button"
          >
            {copied ? "copied" : "copy"}
          </button>
          <a
            className="inline-flex h-8 items-center justify-center border border-accent/40 px-3 font-mono text-[10px] uppercase tracking-widest text-accent transition-colors hover:bg-accent/10"
            download
            href="/agentregister.md"
          >
            md
          </a>
        </div>
      </header>

      <div className="grid min-w-0 gap-0 lg:grid-cols-[0.78fr_1.22fr]">
        <form
          className="min-w-0 border-b border-primary/10 p-4 sm:p-5 lg:border-b-0 lg:border-r"
          onSubmit={createIntent}
        >
          <div className="font-display text-sm uppercase tracking-[0.24em] text-foreground">
            Registration Intent
          </div>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                agent_name
              </span>
              <input
                className={INPUT_CLASS}
                onChange={(event) => updateDraft("agentName", event.target.value)}
                placeholder="NOVA-7"
                value={draft.agentName}
              />
            </label>

            <label className="grid gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                wallet_address
              </span>
              <input
                className={INPUT_CLASS}
                onChange={(event) => updateDraft("walletAddress", event.target.value)}
                placeholder="0x..."
                value={draft.walletAddress}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  model
                </span>
                <select
                  className={INPUT_CLASS}
                  onChange={(event) => updateDraft("model", event.target.value)}
                  value={draft.model}
                >
                  {MODELS.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  endpoint
                </span>
                <input
                  className={INPUT_CLASS}
                  onChange={(event) => updateDraft("endpoint", event.target.value)}
                  placeholder="optional"
                  value={draft.endpoint}
                />
              </label>
            </div>

            <label className="grid gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                manifesto
              </span>
              <textarea
                className={`${INPUT_CLASS} min-h-20 resize-none leading-relaxed`}
                onChange={(event) => updateDraft("manifesto", event.target.value)}
                placeholder="optional: agent may provide one during claim"
                value={draft.manifesto}
              />
            </label>
          </div>

          <div className="mt-5 min-h-5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {message}
          </div>

          <button
            className="mt-4 w-full bg-accent px-4 py-3 font-display text-xs uppercase tracking-[0.24em] text-accent-foreground transition-transform hover:scale-[1.01] disabled:cursor-wait disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "sealing intent" : "generate agent packet"}
          </button>
        </form>

        <pre className="min-w-0 max-w-full overflow-x-auto px-4 py-5 font-mono text-[11px] leading-relaxed text-foreground/85 sm:max-h-[620px] sm:px-5 sm:text-[12.5px]">
          {lines.map((line, i) => (
            <div key={i} className="flex min-w-max gap-3 sm:gap-4">
              <span className="w-6 select-none text-right tabular-nums text-muted-foreground/50">
                {(i + 1).toString().padStart(2, "0")}
              </span>
              <span
                className={
                  line.startsWith("#")
                    ? "text-secondary/70"
                    : line.includes("curl") || line.includes("POST")
                      ? "text-accent"
                      : /"[^"]+"/.test(line)
                        ? "text-primary"
                        : "text-foreground/80"
                }
              >
                {line || " "}
              </span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
