import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, optionsResponse } from "@/lib/relic/http";
import { listAgents } from "@/lib/relic/registry.server";
import type { AgentsResponse } from "@/lib/relic/types";

export const Route = createFileRoute("/api/agents")({
  server: {
    handlers: {
      GET: async () => {
        const agents = listAgents();
        return jsonResponse<AgentsResponse>({
          agents,
          total: agents.length,
          phase: "registration_open",
        });
      },
      OPTIONS: async () => optionsResponse(),
    },
  },
});
