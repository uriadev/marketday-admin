import { gql } from '../gql-tag';

/**
 * Every field `market-mapper.ts` reads, in one place so the operations below
 * can't drift from each other. `MarketModel` has no `latitude`/`longitude` —
 * only the GeoJSON `location` point — and no `vendorCount`; `vendorCount`
 * comes from a second call to `vendors(marketId)`'s `totalCount` (see
 * `GraphqlMarketRepository.detail`).
 */
const MARKET_FIELDS = gql`
  fragment MarketFields on MarketModel {
    id
    slug
    name
    description
    address
    city
    status
    marketType
    schedule
    duration
    location
    tags
    isActive
    organiserName
    organiserPhone
    stallFeePerDay
    reviewApplications
    imageUrl
    bannerImageUrl
    occurrences {
      id
      occursOn
      endsOn
    }
  }
`;

export const ADMIN_MARKETS = gql`
  ${MARKET_FIELDS}
  query AdminMarkets($criteria: CriteriaInput) {
    adminMarkets(criteria: $criteria) {
      ...MarketFields
    }
  }
`;

export const MARKET_BY_ID = gql`
  ${MARKET_FIELDS}
  query MarketById($id: ID!) {
    market(id: $id) {
      ...MarketFields
    }
  }
`;

export const CREATE_MARKET = gql`
  ${MARKET_FIELDS}
  mutation CreateMarket($input: CreateMarketInput!) {
    createMarket(input: $input) {
      ...MarketFields
    }
  }
`;

export const UPDATE_MARKET = gql`
  ${MARKET_FIELDS}
  mutation UpdateMarket($id: ID!, $input: UpdateMarketInput!) {
    updateMarket(id: $id, input: $input) {
      ...MarketFields
    }
  }
`;

export const GENERATE_OCCURRENCES = gql`
  mutation GenerateMarketOccurrences($id: ID!) {
    generateOccurrences(id: $id) {
      id
      occurrences {
        id
        occursOn
        endsOn
      }
    }
  }
`;

/** For `roster()` — the vendor rows a market's Vendors tab lists. */
export const MARKET_VENDORS = gql`
  query MarketVendorsForRoster($marketId: ID!) {
    vendors(marketId: $marketId) {
      totalCount
      items {
        id
        slug
        name
        category
        isActive
        isAcceptingOrders
      }
    }
  }
`;
