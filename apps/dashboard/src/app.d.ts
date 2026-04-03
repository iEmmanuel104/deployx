declare global {
  namespace App {
    interface Locals {
      user?: { id: string; email: string; name: string; role: string };
    }
    interface PageData {}
    interface Error {
      message: string;
      code?: string;
    }
    interface Platform {}
  }
}
export {};
