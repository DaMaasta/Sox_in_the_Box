export type UserRole = 'admin' | 'editor' | 'viewer';

export interface SpaceMember {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export interface Space {
  id: string;
  name: string;
  description: string;
  type: 'box' | 'trolley' | 'kiste' | 'karton' | 'regal' | 'other';
  parentId: string | null;
  ownerId: string;
  memberIds: string[];
  members: Record<string, SpaceMember>;
  icon: string;
  color: string;
  isGroup: boolean;
  accessCode?: string;
  folderId?: string | null;
  boxNumber?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RawSpace = Omit<Space, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

export type ProductUnit = 'Stück' | 'kg' | 'g' | 'L' | 'ml' | 'Packung' | 'Flasche' | 'Dose' | 'Paar' | 'Box';

export interface Product {
  id: string;
  name: string;
  spaceId: string;
  quantity: number;
  minQuantity: number | null;
  unit: ProductUnit;
  category: string;
  description: string;
  barcode: string | null;
  imageUrl: string | null;
  color?: string;
  lastModifiedBy: string;
  lastModifiedByEmail: string;
  lastModifiedAt: Date;
  createdAt: Date;
}

export type RawProduct = Omit<Product, 'lastModifiedAt' | 'createdAt'> & {
  lastModifiedAt: string;
  createdAt: string;
};

export interface CartItem {
  productId: string;
  productName: string;
  imageUrl: string | null;
  cartQuantity: number;
  maxQuantity: number;
  unit: ProductUnit;
  boxId: string;
  boxName: string;
  boxNumber?: number | null;
  parentId: string | null;
  parentName: string;
}

export interface BookingItem {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  imageUrl: string | null;
  boxId: string;
  boxName: string;
  parentId: string | null;
  parentName: string;
}

export interface Booking {
  id: string;
  userId: string;
  userDisplayName: string;
  userEmail: string;
  createdAt: Date;
  parentIds: string[];
  items: BookingItem[];
  type: "booking" | "return";
  originalBookingId?: string;
  isReturned?: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  createdAt: Date;
}

export interface AppNotification {
  id: string;
  targetUserId: string;
  type: 'booking';
  message: string;
  bookingUserName: string;
  groupId: string;
  groupName: string;
  createdAt: Date;
  read: boolean;
}
