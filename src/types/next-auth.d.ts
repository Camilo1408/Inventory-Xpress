import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      name?: string | null;
      role: string;
      tenantId: string;
      inventoryAccess: boolean;
      inventoryPermissions: string[];
    };
  }
  interface User {
    role: string;
    tenantId: string;
    username: string;
    inventoryAccess: boolean;
    inventoryPermissions?: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    tenantId: string;
    username: string;
    inventoryAccess: boolean;
    inventoryPermissions?: string[];
  }
}
