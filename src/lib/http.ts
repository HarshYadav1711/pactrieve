import {NextResponse} from "next/server";
import {z} from "zod";

export function jsonError(message: string, status: number) {
  return NextResponse.json({error: message}, {status});
}

export function jsonOk(body: unknown, status = 200) {
  return NextResponse.json(body, {status, headers: {"Cache-Control": "no-store"}});
}
export function isUuid(value: string) {
  return z.uuid().safeParse(value).success;
}
