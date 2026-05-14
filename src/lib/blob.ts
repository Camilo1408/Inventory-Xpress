import { put } from "@vercel/blob";

export async function uploadProductImage(filename: string, body: ReadableStream | null): Promise<string> {
  if (!body) throw new Error("No file body");
  const blob = await put(`products/${filename}`, body, { access: "public" });
  return blob.url;
}
