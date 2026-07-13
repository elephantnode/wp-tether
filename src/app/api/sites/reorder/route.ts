import { NextResponse } from "next/server";
import { getSites, saveSites } from "@/lib/sites";

export async function POST(request: Request) {
  try {
    const { ids }: { ids: string[] } = await request.json();
    if (!Array.isArray(ids)) {
      return NextResponse.json({ error: "ids must be an array" }, { status: 400 });
    }

    const sites = await getSites();
    const siteMap = new Map(sites.map((s) => [s.id, s]));

    const reordered = ids.flatMap((id) => {
      const site = siteMap.get(id);
      return site ? [site] : [];
    });

    // ids に含まれていないサイトは末尾に残す
    const rest = sites.filter((s) => !ids.includes(s.id));
    await saveSites([...reordered, ...rest]);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to reorder sites" }, { status: 500 });
  }
}
