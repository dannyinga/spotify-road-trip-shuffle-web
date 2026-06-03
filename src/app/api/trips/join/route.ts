import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { inviteCode } = body;

    if (!inviteCode || typeof inviteCode !== "string") {
      return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Check if user is already in a trip
    const { data: existingMember, error: checkError } = await supabase
      .from("road_trip_members")
      .select("trip_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (checkError) {
      return NextResponse.json({ error: checkError.message }, { status: 500 });
    }

    if (existingMember) {
      return NextResponse.json(
        { error: "You must leave your current trip before joining another." },
        { status: 400 }
      );
    }

    // 3. Call the join_road_trip RPC in the database
    const cleanedInviteCode = inviteCode.trim().toUpperCase();
    const { data: tripId, error: rpcError } = await supabase.rpc(
      "join_road_trip",
      { invite_code: cleanedInviteCode }
    );

    if (rpcError) {
      console.error("RPC Error joining trip:", rpcError);
      return NextResponse.json(
        { error: rpcError.message || "Invalid invite code or failed to join trip." },
        { status: 400 }
      );
    }

    // 4. Fetch trip details
    const { data: trip, error: tripError } = await supabase
      .from("road_trips")
      .select("*")
      .eq("id", tripId)
      .single();

    if (tripError) {
      return NextResponse.json({ error: tripError.message }, { status: 500 });
    }

    // 5. Fetch members
    const { data: members, error: membersError } = await supabase.rpc(
      "get_road_trip_members",
      { p_trip_id: tripId }
    );

    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      trip: {
        ...trip,
        members,
      },
    });
  } catch (error) {
    console.error("Error in POST /api/trips/join:", error);
    return NextResponse.json({ error: "Failed to join road trip" }, { status: 500 });
  }
}
