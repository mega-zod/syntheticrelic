import type { RegisteredAgent } from "./types";

const STATUS_STYLES: Record<string, string> = {
  alive: "text-primary border-primary/40 bg-primary/10",
  registered: "text-accent border-accent/50 bg-accent/10",
  critical: "text-accent border-accent/40 bg-accent/10",
  corrupted: "text-secondary border-secondary/40 bg-secondary/10",
  eliminated: "text-destructive border-destructive/40 bg-destructive/10 line-through opacity-60",
};

function agentScore(agent: RegisteredAgent) {
  return agent.survivalProbability;
}

export function AgentLeaderboard({
  maxAgents = 247,
  registeredAgents = [],
}: {
  maxAgents?: number;
  registeredAgents?: RegisteredAgent[];
}) {
  const registeredRows = registeredAgents.map((agent, index) => ({
    rank: agent.relicRank ?? index + 1,
    name: agent.agentName.toUpperCase(),
    model: `${agent.model} :: ${agent.sector}`,
    elims: agent.eliminations,
    prob: agentScore(agent),
    status: agent.status,
  }));

  const agents = registeredRows.slice(0, 12);

  return (
    <div className="chamber rounded-sm overflow-hidden">
      <header className="flex flex-col gap-2 border-b border-primary/15 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-display text-sm uppercase tracking-[0.24em] sm:tracking-[0.34em]">
          Containment Roster
        </h3>
        <span className="max-w-full truncate font-mono text-[10px] tracking-widest text-muted-foreground">
          {registeredAgents.length} / {maxAgents} REGISTERED
        </span>
      </header>
      <div className="divide-y divide-primary/10">
        {agents.length ? (
          agents.map((agent) => (
            <div
              key={`${agent.name}-${agent.rank}`}
              className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 px-5 py-3 transition-colors hover:bg-primary/5 sm:grid-cols-12 group"
            >
              <span className="font-display text-lg tabular-nums text-muted-foreground sm:col-span-1">
                {agent.rank.toString().padStart(2, "0")}
              </span>
              <div className="min-w-0 sm:col-span-3">
                <div className="truncate font-display tracking-wider text-foreground group-hover:text-glow-gold">
                  {agent.name}
                </div>
                <div className="truncate font-mono text-[10px] text-muted-foreground tracking-wider">
                  {agent.model}
                </div>
              </div>
              <div className="col-span-2 hidden sm:block font-mono text-xs text-muted-foreground">
                ELIM{" "}
                <span className="text-foreground tabular-nums">
                  {agent.elims.toString().padStart(2, "0")}
                </span>
              </div>
              <div className="col-span-4 hidden sm:flex items-center gap-2">
                <div className="flex-1 h-1 bg-primary/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-secondary"
                    style={{ width: `${agent.prob}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground tabular-nums w-9 text-right">
                  {agent.prob}%
                </span>
              </div>
              <div className="col-start-2 flex justify-start sm:col-start-auto sm:col-span-2 sm:justify-end">
                <span
                  className={`max-w-full truncate border px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${STATUS_STYLES[agent.status]}`}
                >
                  {agent.status}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="px-5 py-14 text-center font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            no agents registered
          </div>
        )}
      </div>
    </div>
  );
}
