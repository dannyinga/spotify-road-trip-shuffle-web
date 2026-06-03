import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 6-character random code generator
function generateInviteCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function GET() {
  try {
    const supabase = await createClient();

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch user's active trip membership
    const { data: memberRow, error: memberError } = await supabase
      .from("road_trip_members")
      .select("trip_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }

    if (!memberRow) {
      return NextResponse.json({ trip: null });
    }

    const tripId = memberRow.trip_id;

    // 3. Fetch trip details
    const { data: trip, error: tripError } = await supabase
      .from("road_trips")
      .select("*")
      .eq("id", tripId)
      .single();

    if (tripError) {
      return NextResponse.json({ error: tripError.message }, { status: 500 });
    }

    // 4. Fetch trip members with metadata via RPC
    const { data: members, error: rpcError } = await supabase.rpc(
      "get_road_trip_members",
      { p_trip_id: tripId }
    );

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    return NextResponse.json({
      trip: {
        ...trip,
        members,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/trips:", error);
    return NextResponse.json({ error: "Failed to fetch trip details" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Invalid trip name" }, { status: 400 });
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
        { error: "You must leave your current trip before creating a new one." },
        { status: 400 }
      );
    }

    // 3. Generate unique invite code
    let inviteCode = "";
    let attempts = 0;
    while (attempts < 5) {
      const candidate = generateInviteCode();
      const { data: codeCheck } = await supabase
        .from("road_trips")
        .select("id")
        .eq("invite_code", candidate)
        .maybeSingle();

      if (!codeCheck) {
        inviteCode = candidate;
        break;
      }
      attempts++;
    }

    if (!inviteCode) {
      return NextResponse.json({ error: "Failed to generate unique invite code" }, { status: 500 });
    }

    // 4. Create the trip
    const { data: newTrip, error: insertError } = await supabase
      .from("road_trips")
      .insert({
        name,
        host_id: user.id,
        invite_code: inviteCode,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error creating trip:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // 5. Fetch members (should include host automatically via DB trigger)
    const { data: members, error: rpcError } = await supabase.rpc(
      "get_road_trip_members",
      { p_trip_id: newTrip.id }
    );

    if (rpcError) {
      console.error("RPC error fetching members after trip creation:", rpcError);
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    return NextResponse.json({
      trip: {
        ...newTrip,
        members,
      },
    });
  } catch (error) {
    console.error("Error in POST /api/trips:", error);
    return NextResponse.json({ error: "Failed to create trip" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient();

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch membership
    const { data: memberRow, error: memberError } = await supabase
      .from("road_trip_members")
      .select("trip_id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError || !memberRow) {
      return NextResponse.json({ error: "Not in a trip" }, { status: 400 });
    }

    const { trip_id, role } = memberRow;

    if (role === "admin") {
      // If host, delete the entire trip
      const { error: deleteError } = await supabase
        .from("road_trips")
        .delete()
        .eq("id", trip_id);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }
    } else {
      // If passenger, just leave the trip
      const { error: leaveError } = await supabase
        .from("road_trip_members")
        .delete()
        .eq("trip_id", trip_id)
        .eq("user_id", user.id);

      if (leaveError) {
        return NextResponse.json({ error: leaveError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/trips:", error);
    return NextResponse.json({ error: "Failed to leave/delete trip" }, { status: 500 });
  }
}
