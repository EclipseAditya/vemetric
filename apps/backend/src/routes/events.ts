import { TIME_SPANS } from '@vemetric/common/charts/timespans';
import { filterConfigSchema } from '@vemetric/common/filters';
import { clickhouseEvent } from 'clickhouse';
import { z } from 'zod';
import { getTimeSpanStartDate, getTimeSpanEndDate } from '../utils/timeseries';
import { projectProcedure, router } from '../utils/trpc';

const EVENTS_PER_PAGE = 50;

export const eventsRouter = router({
  list: projectProcedure
    .input(
      z.object({
        cursor: z.string().optional(), // ISO timestamp string
        filterConfig: filterConfigSchema,
        timespan: z.enum(TIME_SPANS).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { projectId } = ctx;
      const { timespan = 'live', startDate: customStartDate, endDate: customEndDate } = input;

      const limit = EVENTS_PER_PAGE + 1; // Get one extra to determine if there are more

      // Calculate start date based on timespan (live = no filter, otherwise filter by timespan)
      const startDate = timespan === 'live' ? undefined : getTimeSpanStartDate(timespan, customStartDate);
      const endDate = timespan === 'custom' ? getTimeSpanEndDate(timespan, customEndDate || customStartDate) : undefined;

      // Get paginated events with cursor-based filtering
      const events = await clickhouseEvent.getLatestEventsByProjectId({
        projectId,
        limit,
        cursor: input.cursor, // Used to fetch events before this timestamp
        filterConfig: input.filterConfig,
        startDate,
        endDate,
      });

      const hasMore = events.length > EVENTS_PER_PAGE;
      const latestEvents = hasMore ? events.slice(0, -1) : events;

      return {
        events: latestEvents.map((event) => ({
          ...event,
          userId: String(event.userId),
          projectId: String(event.projectId),
        })),
        nextCursor: hasMore ? latestEvents[latestEvents.length - 1].createdAt : undefined,
      };
    }),
});
