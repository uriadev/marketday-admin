import { gql } from '../gql-tag';

/**
 * Every field `event-mapper.ts` reads. `adminEvents` and `adminEvent` select
 * the same fragment, so a list row and the form's record are one shape.
 *
 * `market`/`vendor` are three fields each — the venue's name and where its
 * console page is. `distanceKm` and `locationAccuracyM` are left out: the
 * first is set by `upcomingEvents` only, the second is a constant.
 */
const EVENT_FIELDS = gql`
  fragment EventFields on EventModel {
    id
    venueKind
    market {
      id
      slug
      name
    }
    vendor {
      id
      slug
      name
    }
    areaName
    address
    latitude
    longitude
    title
    description
    category
    imageUrl
    externalUrl
    isFeatured
    status
    startsAt
    endsAt
    sessions {
      id
      startsAt
      endsAt
      label
    }
  }
`;

/**
 * The Events list — `@Roles(ADMIN)`, status-blind, one page at a time.
 *
 * `criteria` carries the page, the title search and the filters. The aliases
 * are the header's counts, asked in the same round trip: every event, those
 * not yet ended (`$now` is the client's clock, so the count and the "Upcoming
 * & ongoing" filter agree), and drafts. `limit: 1` because only the count is
 * selected.
 */
export const ADMIN_EVENTS = gql`
  ${EVENT_FIELDS}
  query AdminEvents($criteria: CriteriaInput, $now: JSON!) {
    adminEvents(criteria: $criteria) {
      totalCount
      items {
        ...EventFields
      }
    }
    everyEvent: adminEvents(criteria: { limit: 1 }) {
      totalCount
    }
    currentEvents: adminEvents(
      criteria: { limit: 1, filters: [{ field: "endsAt", operator: GT, value: $now }] }
    ) {
      totalCount
    }
    draftEvents: adminEvents(
      criteria: { limit: 1, filters: [{ field: "status", operator: EQUAL, value: "DRAFT" }] }
    ) {
      totalCount
    }
  }
`;

/**
 * One event for the form, drafts and past events included, plus every market
 * it could be held at. `adminEvent` answers `null` for an unknown id.
 *
 * The markets come from `adminMarkets`, drafts included — an organiser may
 * prepare a market's events before launch. Their occurrences are what the
 * form warns against ("no market that day"). Food-truck stops are left out:
 * the console never lists a stop as a market, and a truck's owner manages
 * its stops in the vendor app.
 */
export const EVENT_FORM = gql`
  ${EVENT_FIELDS}
  query EventForm($id: ID!, $withEvent: Boolean!) {
    adminEvent(id: $id) @include(if: $withEvent) {
      ...EventFields
    }
    adminMarkets(
      criteria: {
        limit: 500
        orderBy: "name"
        orderDir: ASC
        filters: [{ field: "kind", operator: EQUAL, value: "PUBLIC_MARKET" }]
      }
    ) {
      id
      name
      city
      status
      occurrences {
        occursOn
        endsOn
      }
    }
  }
`;

export const CREATE_EVENT = gql`
  ${EVENT_FIELDS}
  mutation CreateEvent($input: CreateEventInput!) {
    createEvent(input: $input) {
      ...EventFields
    }
  }
`;

/**
 * `sessions` on the input, when present, is the whole list the event ends up
 * with. Omitted, the sessions are left alone.
 */
export const UPDATE_EVENT = gql`
  ${EVENT_FIELDS}
  mutation UpdateEvent($id: ID!, $input: UpdateEventInput!) {
    updateEvent(id: $id, input: $input) {
      ...EventFields
    }
  }
`;

/** Hard delete; the sessions and any promotions of the event cascade. */
export const DELETE_EVENT = gql`
  mutation DeleteEvent($id: ID!) {
    deleteEvent(id: $id)
  }
`;

/**
 * Vendors by name for the vendor-venue picker. Only an active vendor can host
 * a new event server-side, so only active ones are offered.
 */
export const EVENT_VENDOR_OPTIONS = gql`
  query EventVendorOptions($criteria: CriteriaInput) {
    adminVendors(criteria: $criteria) {
      items {
        id
        name
        category
        isActive
      }
    }
  }
`;
