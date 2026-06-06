import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, optionsResponse } from "@/lib/relic/http";
import type { EventsResponse } from "@/lib/relic/types";

export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      GET: async () =>
        jsonResponse<EventsResponse>({
          events: [],
          total: 0,
        }),
      OPTIONS: async () => optionsResponse(),
    },
  },
});
