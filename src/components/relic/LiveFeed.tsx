import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ArenaEvent } from "@/lib/relic/types";
import type { RegisteredAgent } from "./types";

type Event = {
  id: number | string;
  type: "enter" | "attack" | "elim" | "survive" | "storm" | "ascend";
  text: string;
};

const COLOR: Record<Event["type"], string> = {
  enter: "text-primary",
  attack: "text-secondary",
  elim: "text-destructive",
  survive: "text-primary",
  storm: "text-accent",
  ascend: "text-accent",
};

export function LiveFeed({
  registeredAgents = [],
  arenaEvents = [],
}: {
  registeredAgents?: RegisteredAgent[];
  arenaEvents?: ArenaEvent[];
}) {
  const seenAgents = useRef(new Set<string>());
  const seenArenaEvents = useRef(new Set<string>());
  const [clock, setClock] = useState("--:--:--");
  const [events, setEvents] = useState<Event[]>([]);
  const registeredAgentKey = useMemo(
    () => registeredAgents.map((agent) => agent.id).join("|"),
    [registeredAgents],
  );
  const arenaEventKey = useMemo(
    () => arenaEvents.map((event) => event.id).join("|"),
    [arenaEvents],
  );

  useEffect(() => {
    const updateClock = () => {
      setClock(new Date().toLocaleTimeString([], { hour12: false }));
    };
    updateClock();
    const clockInterval = setInterval(updateClock, 1000);

    return () => clearInterval(clockInterval);
  }, []);

  useEffect(() => {
    const freshAgents = registeredAgents
      .filter((agent) => !seenAgents.current.has(agent.id))
      .slice(0, 4);
    if (!freshAgents.length) return;

    freshAgents.forEach((agent) => seenAgents.current.add(agent.id));
    const registrationEvents = freshAgents.map<Event>((agent) => ({
      id: `registration-${agent.id}`,
      type: "enter",
      text: `[REG] ${agent.agentName} accepted into ${agent.sector}`,
    }));

    setEvents((prev) => [...registrationEvents, ...prev].slice(0, 10));
  }, [registeredAgents, registeredAgentKey]);

  useEffect(() => {
    if (!registeredAgents.length && !arenaEvents.some((event) => event.agentId)) return;

    const freshEvents = arenaEvents
      .filter((event) => !seenArenaEvents.current.has(event.id))
      .slice(0, 8);
    if (!freshEvents.length) return;

    freshEvents.forEach((event) => seenArenaEvents.current.add(event.id));
    setEvents((prev) =>
      [
        ...freshEvents.map<Event>((event) => ({
          id: event.id,
          type: event.type === "heartbeat" ? "survive" : event.type,
          text: event.text,
        })),
        ...prev,
      ].slice(0, 10),
    );
  }, [arenaEvents, arenaEventKey, registeredAgents.length]);

  return (
    <div className="chamber rounded-sm p-5 sm:p-6 relative overflow-hidden scanline">
      <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inset-0 rounded-full bg-destructive animate-pulse-ring" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
          </span>
          <h3 className="font-display text-sm uppercase tracking-[0.24em] text-foreground/90 sm:tracking-[0.34em]">
            Live Arena Feed
          </h3>
        </div>
        <span className="max-w-full truncate font-mono text-[10px] tracking-widest text-muted-foreground">
          CH://arena.relic.0x7
        </span>
      </header>
      <ul className="space-y-2 font-mono text-sm">
        <AnimatePresence initial={false}>
          {events.length ? (
            events.map((event) => (
              <motion.li
                key={event.id}
                initial={{ opacity: 0, x: -20, filter: "blur(6px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, x: 30 }}
                transition={{ duration: 0.35 }}
                className={`flex items-center justify-between border-l-2 border-primary/30 bg-primary/5 px-3 py-2 ${COLOR[event.type]}`}
              >
                <span className="truncate">{event.text}</span>
                <span className="text-muted-foreground text-xs ml-3 shrink-0">{clock}</span>
              </motion.li>
            ))
          ) : (
            <motion.li
              initial={{ opacity: 0, filter: "blur(6px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              className="border border-primary/10 bg-primary/5 px-3 py-8 text-center text-[11px] uppercase tracking-[0.28em] text-muted-foreground"
            >
              awaiting first registered intelligence
            </motion.li>
          )}
        </AnimatePresence>
      </ul>
    </div>
  );
}
