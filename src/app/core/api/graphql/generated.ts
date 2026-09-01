export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** A date-time string at UTC, such as 2019-12-03T09:54:33Z, compliant with the date-time format. */
  DateTime: { input: string; output: string; }
  /** A GeoJSON object as defined by RFC 7946: https://datatracker.ietf.org/doc/html/rfc7946 */
  GeoJSON: { input: { type: string; coordinates: number[] }; output: { type: string; coordinates: number[] }; }
  /** The `JSON` scalar type represents JSON values as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf). */
  JSON: { input: unknown; output: unknown; }
};

export type AccountDeletionLinkInput = {
  token: Scalars['String']['input'];
};

export type AuthResponse = {
  __typename?: 'AuthResponse';
  accessToken: Scalars['String']['output'];
  refreshToken: Scalars['String']['output'];
  user: UserModel;
};

export type AvatarUploadUrlModel = {
  __typename?: 'AvatarUploadUrlModel';
  key: Scalars['String']['output'];
  publicUrl: Scalars['String']['output'];
  uploadUrl: Scalars['String']['output'];
};

export type ChangePasswordInput = {
  currentPassword: Scalars['String']['input'];
  newPassword: Scalars['String']['input'];
};

export enum ContactRole {
  Shopper = 'shopper',
  Vendor = 'vendor'
}

export type CreateMarketInput = {
  address: Scalars['String']['input'];
  bannerImageUrl?: InputMaybe<Scalars['String']['input']>;
  city: Scalars['String']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  /** Duration of the market in minutes */
  duration: Scalars['Int']['input'];
  imageUrl?: InputMaybe<Scalars['String']['input']>;
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  latitude: Scalars['Float']['input'];
  longitude: Scalars['Float']['input'];
  marketType?: InputMaybe<MarketType>;
  name: Scalars['String']['input'];
  organiserName?: InputMaybe<Scalars['String']['input']>;
  organiserPhone?: InputMaybe<Scalars['String']['input']>;
  reviewApplications?: InputMaybe<Scalars['Boolean']['input']>;
  schedule: Scalars['String']['input'];
  slug: Scalars['String']['input'];
  stallFeePerDay?: InputMaybe<Scalars['Float']['input']>;
  status?: InputMaybe<MarketStatus>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type CreateOrderInput = {
  customerName?: InputMaybe<Scalars['String']['input']>;
  customerPhone?: InputMaybe<Scalars['String']['input']>;
  expoPushToken?: InputMaybe<Scalars['String']['input']>;
  items: Array<OrderItemInput>;
  marketId: Scalars['ID']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  pickupTime?: InputMaybe<Scalars['String']['input']>;
  vendorId: Scalars['ID']['input'];
};

export type CreateOrderPayload = {
  __typename?: 'CreateOrderPayload';
  order: OrderModel;
  trackingToken: Scalars['String']['output'];
};

export type CreateProductInput = {
  category?: InputMaybe<ProductCategory>;
  description?: InputMaybe<Scalars['String']['input']>;
  imageUrl?: InputMaybe<Scalars['String']['input']>;
  isAvailable?: InputMaybe<Scalars['Boolean']['input']>;
  name: Scalars['String']['input'];
  price: Scalars['Float']['input'];
  unit?: InputMaybe<ProductUnit>;
};

export type CreateSupportMessageInput = {
  attachmentKeys?: InputMaybe<Array<Scalars['String']['input']>>;
  category: SupportCategory;
  message: Scalars['String']['input'];
  replyToEmail?: InputMaybe<Scalars['String']['input']>;
  subject: Scalars['String']['input'];
};

export type CreateVendorInput = {
  category: Scalars['String']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  imageUrl?: InputMaybe<Scalars['String']['input']>;
  marketIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  name: Scalars['String']['input'];
  slug?: InputMaybe<Scalars['String']['input']>;
};

export type CriteriaInput = {
  filters?: InputMaybe<Array<FilterInput>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDir?: InputMaybe<OrderDirection>;
};

export type DeleteAccountInput = {
  code?: InputMaybe<Scalars['String']['input']>;
  password?: InputMaybe<Scalars['String']['input']>;
};

export type FilterInput = {
  field: Scalars['String']['input'];
  operator: FilterOperator;
  value: Scalars['JSON']['input'];
};

export enum FilterOperator {
  Contains = 'CONTAINS',
  Equal = 'EQUAL',
  Gt = 'GT',
  Gte = 'GTE',
  In = 'IN',
  Lt = 'LT',
  Lte = 'LTE',
  NotContains = 'NOT_CONTAINS',
  NotEqual = 'NOT_EQUAL'
}

export type GoogleAuthInput = {
  idToken: Scalars['String']['input'];
};

export type InviteVendorMemberInput = {
  email: Scalars['String']['input'];
  marketId: Scalars['ID']['input'];
};

export type LoginInput = {
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};

export type MarketBannerUploadUrlModel = {
  __typename?: 'MarketBannerUploadUrlModel';
  key: Scalars['String']['output'];
  publicUrl: Scalars['String']['output'];
  uploadUrl: Scalars['String']['output'];
};

export type MarketImageUploadUrlModel = {
  __typename?: 'MarketImageUploadUrlModel';
  key: Scalars['String']['output'];
  publicUrl: Scalars['String']['output'];
  uploadUrl: Scalars['String']['output'];
};

export type MarketModel = {
  __typename?: 'MarketModel';
  address: Scalars['String']['output'];
  bannerImageUrl: Maybe<Scalars['String']['output']>;
  city: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  description: Maybe<Scalars['String']['output']>;
  distance: Maybe<Scalars['Float']['output']>;
  duration: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  imageUrl: Maybe<Scalars['String']['output']>;
  isActive: Scalars['Boolean']['output'];
  location: Maybe<Scalars['GeoJSON']['output']>;
  marketType: Maybe<MarketType>;
  name: Scalars['String']['output'];
  occurrences: Maybe<Array<MarketOccurrenceModel>>;
  organiserName: Maybe<Scalars['String']['output']>;
  organiserPhone: Maybe<Scalars['String']['output']>;
  reviewApplications: Scalars['Boolean']['output'];
  schedule: Scalars['String']['output'];
  slug: Scalars['String']['output'];
  stallFeePerDay: Maybe<Scalars['Float']['output']>;
  status: MarketStatus;
  tags: Maybe<Array<Scalars['String']['output']>>;
  updatedAt: Scalars['DateTime']['output'];
};

export type MarketOccurrenceModel = {
  __typename?: 'MarketOccurrenceModel';
  endsOn: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['ID']['output'];
  occursOn: Scalars['DateTime']['output'];
};

export enum MarketStatus {
  Draft = 'DRAFT',
  Published = 'PUBLISHED'
}

export enum MarketType {
  CraftArtisan = 'CRAFT_ARTISAN',
  Farmers = 'FARMERS',
  FoodProduce = 'FOOD_PRODUCE',
  Mixed = 'MIXED',
  Vintage = 'VINTAGE'
}

export type Mutation = {
  __typename?: 'Mutation';
  acceptVendorInvite: VendorMemberModel;
  cancelOrder: OrderModel;
  changePassword: UserModel;
  confirmAccountDeletion: Scalars['Boolean']['output'];
  createAvatarUploadUrl: AvatarUploadUrlModel;
  createMarket: MarketModel;
  createMarketBannerUploadUrl: MarketBannerUploadUrlModel;
  createMarketImageUploadUrl: MarketImageUploadUrlModel;
  createOrder: CreateOrderPayload;
  createProduct: ProductModel;
  createProductImageUploadUrl: ProductImageUploadUrlModel;
  createSupportAttachmentUploadUrl: SupportAttachmentUploadUrlModel;
  createVendor: VendorModel;
  createVendorImageUploadUrl: VendorImageUploadUrlModel;
  deleteAccount: Scalars['Boolean']['output'];
  generateOccurrences: MarketModel;
  googleAuth: AuthResponse;
  inviteVendorMember: Scalars['Boolean']['output'];
  joinMarket: VendorModel;
  leaveMarket: VendorModel;
  login: AuthResponse;
  logout: Scalars['Boolean']['output'];
  markAllNotificationsRead: Scalars['Boolean']['output'];
  markNotificationRead: Scalars['Boolean']['output'];
  refreshToken: AuthResponse;
  register: AuthResponse;
  registerPushToken: Scalars['Boolean']['output'];
  removeProductListing: Scalars['Boolean']['output'];
  removeVendorMember: Scalars['Boolean']['output'];
  requestAccountDeletionCode: Scalars['Boolean']['output'];
  requestAccountDeletionLink: Scalars['Boolean']['output'];
  requestPasswordReset: Scalars['Boolean']['output'];
  resetPassword: Scalars['Boolean']['output'];
  revokeVendorInvite: Scalars['Boolean']['output'];
  setProductListing: ProductListingModel;
  setRole: UserModel;
  setVendorAcceptingOrders: VendorModel;
  submitContactMessage: Scalars['Boolean']['output'];
  submitSupportMessage: SupportMessageModel;
  toggleProduct: ProductModel;
  updateMarket: MarketModel;
  updateMe: UserModel;
  updateOrderStatus: OrderModel;
  updateProduct: ProductModel;
  updateVendor: VendorModel;
  updateVendorMember: VendorMemberModel;
  verifyPasswordResetCode: Scalars['Boolean']['output'];
};


export type MutationAcceptVendorInviteArgs = {
  code: Scalars['String']['input'];
};


export type MutationCancelOrderArgs = {
  id: Scalars['ID']['input'];
  trackingToken?: InputMaybe<Scalars['String']['input']>;
};


export type MutationChangePasswordArgs = {
  input: ChangePasswordInput;
};


export type MutationConfirmAccountDeletionArgs = {
  input: AccountDeletionLinkInput;
};


export type MutationCreateAvatarUploadUrlArgs = {
  mimeType: Scalars['String']['input'];
};


export type MutationCreateMarketArgs = {
  input: CreateMarketInput;
};


export type MutationCreateMarketBannerUploadUrlArgs = {
  mimeType: Scalars['String']['input'];
};


export type MutationCreateMarketImageUploadUrlArgs = {
  mimeType: Scalars['String']['input'];
};


export type MutationCreateOrderArgs = {
  input: CreateOrderInput;
};


export type MutationCreateProductArgs = {
  input: CreateProductInput;
  vendorId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationCreateProductImageUploadUrlArgs = {
  mimeType: Scalars['String']['input'];
  vendorId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationCreateSupportAttachmentUploadUrlArgs = {
  mimeType: Scalars['String']['input'];
};


export type MutationCreateVendorArgs = {
  input: CreateVendorInput;
};


export type MutationCreateVendorImageUploadUrlArgs = {
  mimeType: Scalars['String']['input'];
};


export type MutationDeleteAccountArgs = {
  input: DeleteAccountInput;
};


export type MutationGenerateOccurrencesArgs = {
  id: Scalars['ID']['input'];
};


export type MutationGoogleAuthArgs = {
  input: GoogleAuthInput;
};


export type MutationInviteVendorMemberArgs = {
  input: InviteVendorMemberInput;
};


export type MutationJoinMarketArgs = {
  marketId: Scalars['ID']['input'];
};


export type MutationLeaveMarketArgs = {
  marketId: Scalars['ID']['input'];
};


export type MutationLoginArgs = {
  input: LoginInput;
};


export type MutationMarkNotificationReadArgs = {
  id: Scalars['ID']['input'];
};


export type MutationRefreshTokenArgs = {
  input: RefreshTokenInput;
};


export type MutationRegisterArgs = {
  input: RegisterInput;
};


export type MutationRegisterPushTokenArgs = {
  token: Scalars['String']['input'];
};


export type MutationRemoveProductListingArgs = {
  marketId: Scalars['ID']['input'];
  productId: Scalars['ID']['input'];
};


export type MutationRemoveVendorMemberArgs = {
  userId: Scalars['ID']['input'];
};


export type MutationRequestAccountDeletionLinkArgs = {
  input: RequestAccountDeletionLinkInput;
};


export type MutationRequestPasswordResetArgs = {
  input: RequestPasswordResetInput;
};


export type MutationResetPasswordArgs = {
  input: ResetPasswordInput;
};


export type MutationRevokeVendorInviteArgs = {
  id: Scalars['ID']['input'];
};


export type MutationSetProductListingArgs = {
  input: SetProductListingInput;
};


export type MutationSetRoleArgs = {
  input: SetRoleInput;
};


export type MutationSetVendorAcceptingOrdersArgs = {
  accepting: Scalars['Boolean']['input'];
};


export type MutationSubmitContactMessageArgs = {
  input: SubmitContactMessageInput;
};


export type MutationSubmitSupportMessageArgs = {
  input: CreateSupportMessageInput;
};


export type MutationToggleProductArgs = {
  id: Scalars['ID']['input'];
};


export type MutationUpdateMarketArgs = {
  id: Scalars['ID']['input'];
  input: UpdateMarketInput;
};


export type MutationUpdateMeArgs = {
  input: UpdateUserInput;
};


export type MutationUpdateOrderStatusArgs = {
  id: Scalars['ID']['input'];
  input: UpdateOrderStatusInput;
};


export type MutationUpdateProductArgs = {
  id: Scalars['ID']['input'];
  input: UpdateProductInput;
};


export type MutationUpdateVendorArgs = {
  id: Scalars['ID']['input'];
  input: UpdateVendorInput;
};


export type MutationUpdateVendorMemberArgs = {
  input: UpdateVendorMemberInput;
};


export type MutationVerifyPasswordResetCodeArgs = {
  input: VerifyPasswordResetCodeInput;
};

export type Notification = {
  __typename?: 'Notification';
  body: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  data: Scalars['JSON']['output'];
  id: Scalars['ID']['output'];
  readAt: Maybe<Scalars['DateTime']['output']>;
  title: Scalars['String']['output'];
  type: NotificationType;
};

export enum NotificationType {
  NewOrder = 'NEW_ORDER',
  OrderCancelled = 'ORDER_CANCELLED',
  OrderStatusChanged = 'ORDER_STATUS_CHANGED'
}

export type NotificationsPage = {
  __typename?: 'NotificationsPage';
  items: Array<Notification>;
  totalCount: Scalars['Int']['output'];
};

export enum OrderDirection {
  Asc = 'ASC',
  Desc = 'DESC'
}

export enum OrderEventSource {
  BuyerApp = 'BUYER_APP',
  Checkout = 'CHECKOUT',
  Migrated = 'MIGRATED',
  VendorApp = 'VENDOR_APP'
}

export type OrderItemInput = {
  productId: Scalars['ID']['input'];
  quantity: Scalars['Int']['input'];
};

export type OrderItemModel = {
  __typename?: 'OrderItemModel';
  id: Scalars['ID']['output'];
  orderId: Scalars['ID']['output'];
  product: Maybe<ProductModel>;
  productId: Scalars['ID']['output'];
  quantity: Scalars['Int']['output'];
  unitPrice: Scalars['Float']['output'];
};

export type OrderModel = {
  __typename?: 'OrderModel';
  buyerId: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  customerName: Maybe<Scalars['String']['output']>;
  customerPhone: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  items: Array<OrderItemModel>;
  market: Maybe<MarketModel>;
  marketId: Scalars['ID']['output'];
  notes: Maybe<Scalars['String']['output']>;
  pickupTime: Maybe<Scalars['String']['output']>;
  status: OrderStatus;
  total: Scalars['Float']['output'];
  updatedAt: Scalars['DateTime']['output'];
  vendor: Maybe<VendorModel>;
  vendorId: Scalars['ID']['output'];
};

export enum OrderStatus {
  Accepted = 'ACCEPTED',
  Cancelled = 'CANCELLED',
  Completed = 'COMPLETED',
  Pending = 'PENDING',
  Preparing = 'PREPARING',
  Ready = 'READY',
  Rejected = 'REJECTED'
}

export type OrderStatusEventModel = {
  __typename?: 'OrderStatusEventModel';
  actorName: Maybe<Scalars['String']['output']>;
  actorRole: Maybe<VendorMemberRole>;
  createdAt: Scalars['DateTime']['output'];
  fromStatus: Maybe<OrderStatus>;
  id: Scalars['ID']['output'];
  source: OrderEventSource;
  toStatus: OrderStatus;
};

export enum ProductCategory {
  BakedGoods = 'BAKED_GOODS',
  Beverages = 'BEVERAGES',
  DairyAndEggs = 'DAIRY_AND_EGGS',
  Flowers = 'FLOWERS',
  Fruit = 'FRUIT',
  Herbs = 'HERBS',
  HoneyAndPreserves = 'HONEY_AND_PRESERVES',
  Meat = 'MEAT',
  Other = 'OTHER',
  Pantry = 'PANTRY',
  Seafood = 'SEAFOOD',
  Vegetable = 'VEGETABLE'
}

export type ProductImageUploadUrlModel = {
  __typename?: 'ProductImageUploadUrlModel';
  key: Scalars['String']['output'];
  publicUrl: Scalars['String']['output'];
  uploadUrl: Scalars['String']['output'];
};

export type ProductListingModel = {
  __typename?: 'ProductListingModel';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  isAvailable: Scalars['Boolean']['output'];
  marketId: Scalars['ID']['output'];
  priceOverride: Maybe<Scalars['Float']['output']>;
  productId: Scalars['ID']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type ProductModel = {
  __typename?: 'ProductModel';
  category: Maybe<ProductCategory>;
  createdAt: Scalars['DateTime']['output'];
  description: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  imageUrl: Maybe<Scalars['String']['output']>;
  isAvailable: Scalars['Boolean']['output'];
  listings: Array<ProductListingModel>;
  name: Scalars['String']['output'];
  price: Scalars['Float']['output'];
  unit: ProductUnit;
  updatedAt: Scalars['DateTime']['output'];
  vendor: Maybe<VendorModel>;
  vendorId: Scalars['ID']['output'];
};

export enum ProductUnit {
  Bag = 'BAG',
  Box = 'BOX',
  Bunch = 'BUNCH',
  Dozen = 'DOZEN',
  Each = 'EACH',
  G = 'G',
  Jar = 'JAR',
  Kg = 'KG',
  Lb = 'LB',
  Liter = 'LITER',
  Ml = 'ML',
  Oz = 'OZ',
  Pint = 'PINT',
  Quart = 'QUART'
}

export type ProductsPage = {
  __typename?: 'ProductsPage';
  items: Array<ProductModel>;
  totalCount: Scalars['Int']['output'];
};

export type Query = {
  __typename?: 'Query';
  accountDeletionLinkValid: Scalars['Boolean']['output'];
  adminMarkets: Array<MarketModel>;
  adminVendorMembers: VendorMembersPage;
  adminVendors: VendorsPage;
  /** Find 5 nearby markets */
  findNearby: Array<MarketModel>;
  /** Find upcoming 5 markets */
  findUpcomingMarkets: Array<MarketModel>;
  market: Maybe<MarketModel>;
  markets: Array<MarketModel>;
  me: UserProfileModel;
  myNotifications: NotificationsPage;
  myOrders: Array<OrderModel>;
  orderByToken: Maybe<OrderModel>;
  orderStatusHistory: Array<OrderStatusEventModel>;
  ordersByTokens: Array<OrderModel>;
  pendingVendorInvites: Array<VendorInviteModel>;
  product: Maybe<ProductModel>;
  products: ProductsPage;
  scheduleMarkets: Array<MarketModel>;
  search: SearchResults;
  unreadNotificationCount: Scalars['Int']['output'];
  vendor: Maybe<VendorModel>;
  vendorMembers: Array<VendorMemberModel>;
  vendorOrders: Array<OrderModel>;
  vendors: VendorsPage;
};


export type QueryAccountDeletionLinkValidArgs = {
  input: AccountDeletionLinkInput;
};


export type QueryAdminMarketsArgs = {
  criteria?: InputMaybe<CriteriaInput>;
};


export type QueryAdminVendorMembersArgs = {
  criteria?: InputMaybe<CriteriaInput>;
};


export type QueryAdminVendorsArgs = {
  criteria?: InputMaybe<CriteriaInput>;
};


export type QueryFindNearbyArgs = {
  latitude: Scalars['Float']['input'];
  longitude: Scalars['Float']['input'];
};


export type QueryMarketArgs = {
  id: Scalars['ID']['input'];
};


export type QueryMarketsArgs = {
  city?: InputMaybe<Scalars['String']['input']>;
  criteria?: InputMaybe<CriteriaInput>;
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryMyNotificationsArgs = {
  limit?: Scalars['Int']['input'];
  offset?: Scalars['Int']['input'];
  unreadOnly?: Scalars['Boolean']['input'];
};


export type QueryOrderByTokenArgs = {
  token: Scalars['String']['input'];
};


export type QueryOrderStatusHistoryArgs = {
  orderId: Scalars['ID']['input'];
};


export type QueryOrdersByTokensArgs = {
  tokens: Array<Scalars['String']['input']>;
};


export type QueryProductArgs = {
  id: Scalars['ID']['input'];
};


export type QueryProductsArgs = {
  criteria?: InputMaybe<CriteriaInput>;
  marketId?: InputMaybe<Scalars['ID']['input']>;
  onlyAvailable?: InputMaybe<Scalars['Boolean']['input']>;
  vendorId: Scalars['ID']['input'];
};


export type QueryScheduleMarketsArgs = {
  end: Scalars['DateTime']['input'];
  start: Scalars['DateTime']['input'];
};


export type QuerySearchArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  query: Scalars['String']['input'];
  types?: InputMaybe<Array<SearchType>>;
};


export type QueryVendorArgs = {
  id: Scalars['ID']['input'];
};


export type QueryVendorOrdersArgs = {
  marketId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryVendorsArgs = {
  criteria?: InputMaybe<CriteriaInput>;
  marketId: Scalars['ID']['input'];
};

export type RefreshTokenInput = {
  refreshToken: Scalars['String']['input'];
};

export type RegisterInput = {
  email: Scalars['String']['input'];
  fullName: Scalars['String']['input'];
  password: Scalars['String']['input'];
};

export type RequestAccountDeletionLinkInput = {
  email: Scalars['String']['input'];
};

export type RequestPasswordResetInput = {
  email: Scalars['String']['input'];
};

export type ResetPasswordInput = {
  code: Scalars['String']['input'];
  email: Scalars['String']['input'];
  newPassword: Scalars['String']['input'];
};

export type SearchResults = {
  __typename?: 'SearchResults';
  markets: Array<MarketModel>;
  products: Array<ProductModel>;
  vendors: Array<VendorModel>;
};

export enum SearchType {
  Market = 'MARKET',
  Product = 'PRODUCT',
  Vendor = 'VENDOR'
}

export type SetProductListingInput = {
  isAvailable?: InputMaybe<Scalars['Boolean']['input']>;
  marketId: Scalars['ID']['input'];
  priceOverride?: InputMaybe<Scalars['Float']['input']>;
  productId: Scalars['ID']['input'];
};

export type SetRoleInput = {
  role: UserRole;
  userId: Scalars['ID']['input'];
};

export type SubmitContactMessageInput = {
  email: Scalars['String']['input'];
  message: Scalars['String']['input'];
  name: Scalars['String']['input'];
  role: ContactRole;
  subject: Scalars['String']['input'];
};

export type SupportAttachmentModel = {
  __typename?: 'SupportAttachmentModel';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  mimeType: Scalars['String']['output'];
  sizeBytes: Scalars['Int']['output'];
};

export type SupportAttachmentUploadUrlModel = {
  __typename?: 'SupportAttachmentUploadUrlModel';
  key: Scalars['String']['output'];
  uploadUrl: Scalars['String']['output'];
};

export enum SupportCategory {
  Account = 'ACCOUNT',
  Bug = 'BUG',
  Orders = 'ORDERS',
  Other = 'OTHER',
  Payments = 'PAYMENTS'
}

export type SupportMessageModel = {
  __typename?: 'SupportMessageModel';
  attachments: Array<SupportAttachmentModel>;
  category: SupportCategory;
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  message: Scalars['String']['output'];
  subject: Scalars['String']['output'];
};

export type UpdateMarketInput = {
  address?: InputMaybe<Scalars['String']['input']>;
  bannerImageUrl?: InputMaybe<Scalars['String']['input']>;
  city?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  /** Duration of the market in minutes */
  duration?: InputMaybe<Scalars['Int']['input']>;
  imageUrl?: InputMaybe<Scalars['String']['input']>;
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  latitude?: InputMaybe<Scalars['Float']['input']>;
  longitude?: InputMaybe<Scalars['Float']['input']>;
  marketType?: InputMaybe<MarketType>;
  name?: InputMaybe<Scalars['String']['input']>;
  organiserName?: InputMaybe<Scalars['String']['input']>;
  organiserPhone?: InputMaybe<Scalars['String']['input']>;
  reviewApplications?: InputMaybe<Scalars['Boolean']['input']>;
  schedule?: InputMaybe<Scalars['String']['input']>;
  slug?: InputMaybe<Scalars['String']['input']>;
  stallFeePerDay?: InputMaybe<Scalars['Float']['input']>;
  status?: InputMaybe<MarketStatus>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type UpdateOrderStatusInput = {
  status: OrderStatus;
};

export type UpdateProductInput = {
  category?: InputMaybe<ProductCategory>;
  description?: InputMaybe<Scalars['String']['input']>;
  imageUrl?: InputMaybe<Scalars['String']['input']>;
  isAvailable?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  price?: InputMaybe<Scalars['Float']['input']>;
  unit?: InputMaybe<ProductUnit>;
};

export type UpdateUserInput = {
  avatarUrl?: InputMaybe<Scalars['String']['input']>;
  email?: InputMaybe<Scalars['String']['input']>;
  expoPushToken?: InputMaybe<Scalars['String']['input']>;
  fullName?: InputMaybe<Scalars['String']['input']>;
  phone?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateVendorInput = {
  category?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  imageUrl?: InputMaybe<Scalars['String']['input']>;
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  slug?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateVendorMemberInput = {
  marketId: Scalars['ID']['input'];
  userId: Scalars['ID']['input'];
};

export type UserModel = {
  __typename?: 'UserModel';
  avatarUrl: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  email: Scalars['String']['output'];
  fullName: Scalars['String']['output'];
  hasPassword: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  phone: Maybe<Scalars['String']['output']>;
  role: UserRole;
  updatedAt: Scalars['DateTime']['output'];
  vendor: Maybe<VendorModel>;
  vendorId: Maybe<Scalars['ID']['output']>;
  vendorMarketId: Maybe<Scalars['ID']['output']>;
  vendorRole: Maybe<VendorMemberRole>;
};

export type UserProfileModel = {
  __typename?: 'UserProfileModel';
  avatarUrl: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  email: Scalars['String']['output'];
  fullName: Scalars['String']['output'];
  hasPassword: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  phone: Maybe<Scalars['String']['output']>;
  role: UserRole;
  totalOrders: Scalars['Int']['output'];
  totalSpend: Scalars['Float']['output'];
  updatedAt: Scalars['DateTime']['output'];
  vendor: Maybe<VendorModel>;
  vendorId: Maybe<Scalars['ID']['output']>;
  vendorMarketId: Maybe<Scalars['ID']['output']>;
  vendorRole: Maybe<VendorMemberRole>;
};

export enum UserRole {
  Admin = 'ADMIN',
  Buyer = 'BUYER',
  Vendor = 'VENDOR'
}

export type VendorImageUploadUrlModel = {
  __typename?: 'VendorImageUploadUrlModel';
  key: Scalars['String']['output'];
  publicUrl: Scalars['String']['output'];
  uploadUrl: Scalars['String']['output'];
};

export type VendorInviteModel = {
  __typename?: 'VendorInviteModel';
  createdAt: Scalars['DateTime']['output'];
  email: Scalars['String']['output'];
  expiresAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  market: Maybe<MarketModel>;
  marketId: Scalars['ID']['output'];
};

export type VendorMemberModel = {
  __typename?: 'VendorMemberModel';
  avatarUrl: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  email: Scalars['String']['output'];
  fullName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  market: Maybe<MarketModel>;
  marketId: Maybe<Scalars['ID']['output']>;
  role: VendorMemberRole;
  userId: Scalars['ID']['output'];
  vendorId: Scalars['ID']['output'];
};

export enum VendorMemberRole {
  Owner = 'OWNER',
  Staff = 'STAFF'
}

export type VendorMembersPage = {
  __typename?: 'VendorMembersPage';
  items: Array<VendorMemberModel>;
  totalCount: Scalars['Int']['output'];
};

export type VendorModel = {
  __typename?: 'VendorModel';
  category: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  description: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  imageUrl: Maybe<Scalars['String']['output']>;
  isAcceptingOrders: Scalars['Boolean']['output'];
  isActive: Scalars['Boolean']['output'];
  markets: Array<MarketModel>;
  memberCount: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type VendorsPage = {
  __typename?: 'VendorsPage';
  items: Array<VendorModel>;
  totalCount: Scalars['Int']['output'];
};

export type VerifyPasswordResetCodeInput = {
  code: Scalars['String']['input'];
  email: Scalars['String']['input'];
};

export type LoginMutationVariables = Exact<{
  input: LoginInput;
}>;


export type LoginMutation = { __typename?: 'Mutation', login: { __typename?: 'AuthResponse', accessToken: string, refreshToken: string, user: { __typename?: 'UserModel', id: string, fullName: string, email: string, role: UserRole } } };

export type RefreshSessionMutationVariables = Exact<{
  input: RefreshTokenInput;
}>;


export type RefreshSessionMutation = { __typename?: 'Mutation', session: { __typename?: 'AuthResponse', accessToken: string, refreshToken: string } };

export type LogoutMutationVariables = Exact<{ [key: string]: never; }>;


export type LogoutMutation = { __typename?: 'Mutation', logout: boolean };

export type MarketFieldsFragment = { __typename?: 'MarketModel', id: string, slug: string, name: string, description: string | null, address: string, city: string, status: MarketStatus, marketType: MarketType | null, schedule: string, duration: number, location: { type: string; coordinates: number[] } | null, tags: Array<string> | null, isActive: boolean, organiserName: string | null, organiserPhone: string | null, stallFeePerDay: number | null, reviewApplications: boolean, imageUrl: string | null, bannerImageUrl: string | null, occurrences: Array<{ __typename?: 'MarketOccurrenceModel', id: string, occursOn: string, endsOn: string | null }> | null };

export type AdminMarketsQueryVariables = Exact<{
  criteria?: InputMaybe<CriteriaInput>;
}>;


export type AdminMarketsQuery = { __typename?: 'Query', adminMarkets: Array<{ __typename?: 'MarketModel', id: string, slug: string, name: string, description: string | null, address: string, city: string, status: MarketStatus, marketType: MarketType | null, schedule: string, duration: number, location: { type: string; coordinates: number[] } | null, tags: Array<string> | null, isActive: boolean, organiserName: string | null, organiserPhone: string | null, stallFeePerDay: number | null, reviewApplications: boolean, imageUrl: string | null, bannerImageUrl: string | null, occurrences: Array<{ __typename?: 'MarketOccurrenceModel', id: string, occursOn: string, endsOn: string | null }> | null }> };

export type MarketByIdQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type MarketByIdQuery = { __typename?: 'Query', market: { __typename?: 'MarketModel', id: string, slug: string, name: string, description: string | null, address: string, city: string, status: MarketStatus, marketType: MarketType | null, schedule: string, duration: number, location: { type: string; coordinates: number[] } | null, tags: Array<string> | null, isActive: boolean, organiserName: string | null, organiserPhone: string | null, stallFeePerDay: number | null, reviewApplications: boolean, imageUrl: string | null, bannerImageUrl: string | null, occurrences: Array<{ __typename?: 'MarketOccurrenceModel', id: string, occursOn: string, endsOn: string | null }> | null } | null };

export type CreateMarketMutationVariables = Exact<{
  input: CreateMarketInput;
}>;


export type CreateMarketMutation = { __typename?: 'Mutation', createMarket: { __typename?: 'MarketModel', id: string, slug: string, name: string, description: string | null, address: string, city: string, status: MarketStatus, marketType: MarketType | null, schedule: string, duration: number, location: { type: string; coordinates: number[] } | null, tags: Array<string> | null, isActive: boolean, organiserName: string | null, organiserPhone: string | null, stallFeePerDay: number | null, reviewApplications: boolean, imageUrl: string | null, bannerImageUrl: string | null, occurrences: Array<{ __typename?: 'MarketOccurrenceModel', id: string, occursOn: string, endsOn: string | null }> | null } };

export type UpdateMarketMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateMarketInput;
}>;


export type UpdateMarketMutation = { __typename?: 'Mutation', updateMarket: { __typename?: 'MarketModel', id: string, slug: string, name: string, description: string | null, address: string, city: string, status: MarketStatus, marketType: MarketType | null, schedule: string, duration: number, location: { type: string; coordinates: number[] } | null, tags: Array<string> | null, isActive: boolean, organiserName: string | null, organiserPhone: string | null, stallFeePerDay: number | null, reviewApplications: boolean, imageUrl: string | null, bannerImageUrl: string | null, occurrences: Array<{ __typename?: 'MarketOccurrenceModel', id: string, occursOn: string, endsOn: string | null }> | null } };

export type GenerateMarketOccurrencesMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type GenerateMarketOccurrencesMutation = { __typename?: 'Mutation', generateOccurrences: { __typename?: 'MarketModel', id: string, occurrences: Array<{ __typename?: 'MarketOccurrenceModel', id: string, occursOn: string, endsOn: string | null }> | null } };

export type MarketVendorsForRosterQueryVariables = Exact<{
  marketId: Scalars['ID']['input'];
}>;


export type MarketVendorsForRosterQuery = { __typename?: 'Query', vendors: { __typename?: 'VendorsPage', totalCount: number, items: Array<{ __typename?: 'VendorModel', id: string, slug: string, name: string, category: string, isActive: boolean, isAcceptingOrders: boolean }> } };

export type CreateMarketImageUploadUrlMutationVariables = Exact<{
  mimeType: Scalars['String']['input'];
}>;


export type CreateMarketImageUploadUrlMutation = { __typename?: 'Mutation', createMarketImageUploadUrl: { __typename?: 'MarketImageUploadUrlModel', key: string, publicUrl: string, uploadUrl: string } };

export type CreateMarketBannerUploadUrlMutationVariables = Exact<{
  mimeType: Scalars['String']['input'];
}>;


export type CreateMarketBannerUploadUrlMutation = { __typename?: 'Mutation', createMarketBannerUploadUrl: { __typename?: 'MarketBannerUploadUrlModel', key: string, publicUrl: string, uploadUrl: string } };

export type CreateVendorImageUploadUrlMutationVariables = Exact<{
  mimeType: Scalars['String']['input'];
}>;


export type CreateVendorImageUploadUrlMutation = { __typename?: 'Mutation', createVendorImageUploadUrl: { __typename?: 'VendorImageUploadUrlModel', key: string, publicUrl: string, uploadUrl: string } };

export type CreateProductImageUploadUrlMutationVariables = Exact<{
  mimeType: Scalars['String']['input'];
}>;


export type CreateProductImageUploadUrlMutation = { __typename?: 'Mutation', createProductImageUploadUrl: { __typename?: 'ProductImageUploadUrlModel', key: string, publicUrl: string, uploadUrl: string } };

export type CreateAvatarUploadUrlMutationVariables = Exact<{
  mimeType: Scalars['String']['input'];
}>;


export type CreateAvatarUploadUrlMutation = { __typename?: 'Mutation', createAvatarUploadUrl: { __typename?: 'AvatarUploadUrlModel', key: string, publicUrl: string, uploadUrl: string } };

export type ProductFieldsFragment = { __typename?: 'ProductModel', id: string, name: string, category: ProductCategory | null, unit: ProductUnit, price: number, description: string | null, imageUrl: string | null, isAvailable: boolean, listings: Array<{ __typename?: 'ProductListingModel', marketId: string, isAvailable: boolean }> };

export type VendorProductsQueryVariables = Exact<{
  vendorId: Scalars['ID']['input'];
  criteria?: InputMaybe<CriteriaInput>;
}>;


export type VendorProductsQuery = { __typename?: 'Query', vendor: { __typename?: 'VendorModel', id: string, slug: string, name: string, isActive: boolean, isAcceptingOrders: boolean, markets: Array<{ __typename?: 'MarketModel', id: string, slug: string, name: string, city: string }> } | null, products: { __typename?: 'ProductsPage', totalCount: number, items: Array<{ __typename?: 'ProductModel', id: string, name: string, category: ProductCategory | null, unit: ProductUnit, price: number, description: string | null, imageUrl: string | null, isAvailable: boolean, listings: Array<{ __typename?: 'ProductListingModel', marketId: string, isAvailable: boolean }> }> } };

export type AdminVendorIdsQueryVariables = Exact<{ [key: string]: never; }>;


export type AdminVendorIdsQuery = { __typename?: 'Query', adminVendors: { __typename?: 'VendorsPage', items: Array<{ __typename?: 'VendorModel', id: string, slug: string }> } };

export type CreateProductMutationVariables = Exact<{
  vendorId: Scalars['ID']['input'];
  input: CreateProductInput;
}>;


export type CreateProductMutation = { __typename?: 'Mutation', createProduct: { __typename?: 'ProductModel', id: string, name: string, category: ProductCategory | null, unit: ProductUnit, price: number, description: string | null, imageUrl: string | null, isAvailable: boolean, listings: Array<{ __typename?: 'ProductListingModel', marketId: string, isAvailable: boolean }> } };

export type UpdateProductMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateProductInput;
}>;


export type UpdateProductMutation = { __typename?: 'Mutation', updateProduct: { __typename?: 'ProductModel', id: string, name: string, category: ProductCategory | null, unit: ProductUnit, price: number, description: string | null, imageUrl: string | null, isAvailable: boolean, listings: Array<{ __typename?: 'ProductListingModel', marketId: string, isAvailable: boolean }> } };

export type ToggleProductMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type ToggleProductMutation = { __typename?: 'Mutation', toggleProduct: { __typename?: 'ProductModel', id: string, name: string, category: ProductCategory | null, unit: ProductUnit, price: number, description: string | null, imageUrl: string | null, isAvailable: boolean, listings: Array<{ __typename?: 'ProductListingModel', marketId: string, isAvailable: boolean }> } };

export type SetProductListingMutationVariables = Exact<{
  input: SetProductListingInput;
}>;


export type SetProductListingMutation = { __typename?: 'Mutation', setProductListing: { __typename?: 'ProductListingModel', id: string, productId: string, marketId: string, isAvailable: boolean } };

export type RemoveProductListingMutationVariables = Exact<{
  productId: Scalars['ID']['input'];
  marketId: Scalars['ID']['input'];
}>;


export type RemoveProductListingMutation = { __typename?: 'Mutation', removeProductListing: boolean };

export type MeQueryVariables = Exact<{ [key: string]: never; }>;


export type MeQuery = { __typename?: 'Query', me: { __typename?: 'UserProfileModel', id: string, fullName: string, email: string, phone: string | null, avatarUrl: string | null, role: UserRole, hasPassword: boolean } };

export type UpdateMeMutationVariables = Exact<{
  input: UpdateUserInput;
}>;


export type UpdateMeMutation = { __typename?: 'Mutation', updateMe: { __typename?: 'UserModel', id: string, fullName: string, email: string, phone: string | null, avatarUrl: string | null, role: UserRole, hasPassword: boolean } };

export type RequestPasswordResetMutationVariables = Exact<{
  input: RequestPasswordResetInput;
}>;


export type RequestPasswordResetMutation = { __typename?: 'Mutation', requestPasswordReset: boolean };

export type VendorFieldsFragment = { __typename?: 'VendorModel', id: string, slug: string, name: string, category: string, description: string | null, imageUrl: string | null, isActive: boolean, isAcceptingOrders: boolean, memberCount: number, createdAt: string, markets: Array<{ __typename?: 'MarketModel', id: string, slug: string, name: string, city: string, schedule: string }> };

export type AdminVendorsQueryVariables = Exact<{
  criteria?: InputMaybe<CriteriaInput>;
}>;


export type AdminVendorsQuery = { __typename?: 'Query', adminVendors: { __typename?: 'VendorsPage', totalCount: number, items: Array<{ __typename?: 'VendorModel', id: string, slug: string, name: string, category: string, description: string | null, imageUrl: string | null, isActive: boolean, isAcceptingOrders: boolean, memberCount: number, createdAt: string, markets: Array<{ __typename?: 'MarketModel', id: string, slug: string, name: string, city: string, schedule: string }> }> } };

export type VendorByIdQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type VendorByIdQuery = { __typename?: 'Query', vendor: { __typename?: 'VendorModel', id: string, slug: string, name: string, category: string, description: string | null, imageUrl: string | null, isActive: boolean, isAcceptingOrders: boolean, memberCount: number, createdAt: string, markets: Array<{ __typename?: 'MarketModel', id: string, slug: string, name: string, city: string, schedule: string }> } | null };

export type AdminVendorMembersQueryVariables = Exact<{
  criteria?: InputMaybe<CriteriaInput>;
}>;


export type AdminVendorMembersQuery = { __typename?: 'Query', adminVendorMembers: { __typename?: 'VendorMembersPage', totalCount: number, items: Array<{ __typename?: 'VendorMemberModel', id: string, userId: string, fullName: string, email: string, role: VendorMemberRole, market: { __typename?: 'MarketModel', id: string, name: string } | null }> } };
