import { NextResponse } from "next/server";
import { inferWithTeeML, type ComputeChatMessage } from "@/lib/0g/compute";

type ChatRequestBody = {
  messages?: ComputeChatMessage[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequestBody;

    if (!body.messages || body.messages.length === 0) {
      return NextResponse.json(
        { error: "messages is required." },
        { status: 400 },
      );
    }

    const sanitizedMessages = body.messages
      .filter((message) => message.content.trim().length > 0)
      .map((message) => ({
        role: message.role,
        content: message.content.trim(),
      }));

    if (sanitizedMessages.length === 0) {
      return NextResponse.json(
        { error: "At least one non-empty message is required." },
        { status: 400 },
      );
    }

    const result = await inferWithTeeML(sanitizedMessages);

    return NextResponse.json({
      response: result.content,
      attestationHash: result.attestationHash,
      model: result.model,
      providerAddress: result.providerAddress,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected chat route error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
