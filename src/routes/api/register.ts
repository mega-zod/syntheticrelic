import { createFileRoute } from "@tanstack/react-router";
import { errorResponse, jsonResponse, optionsResponse } from "@/lib/relic/http";
import { parseRegisterPayload, registerAgent } from "@/lib/relic/registry.server";
import type { RegisterResponse } from "@/lib/relic/types";

export const Route = createFileRoute("/api/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return errorResponse("invalid_json", 400);
        }

        const result = parseRegisterPayload(body);
        if (!result.success) {
          return errorResponse(
            "invalid_manifest",
            422,
            result.error.issues.map((issue) => issue.message),
          );
        }

        const agent = await registerAgent(result.data);
        return jsonResponse<RegisterResponse>(
          {
            agent,
            token: agent.token,
            agent_id: agent.id,
            arena: agent.sector,
            phase: "registration_open",
          },
          { status: 201 },
        );
      },
      OPTIONS: async () => optionsResponse(),
    },
  },
});
