import { withdrawOwnerCreditsFromServer } from "@/lib/0g/credits";

export const dynamic = "force-dynamic";

type WithdrawRequestBody = {
  adminSecret?: string;
};

function unauthorizedResponse() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request) {
  const configuredSecret = process.env.ADMIN_SECRET?.trim();
  if (!configuredSecret) {
    return new Response(JSON.stringify({ error: "ADMIN_SECRET is not configured." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const headerSecret = request.headers.get("x-admin-secret")?.trim();
  let bodySecret: string | undefined;
  try {
    const body = (await request.json()) as WithdrawRequestBody;
    bodySecret = body.adminSecret?.trim();
  } catch {
    bodySecret = undefined;
  }

  const providedSecret = headerSecret || bodySecret;
  if (!providedSecret || providedSecret !== configuredSecret) {
    return unauthorizedResponse();
  }

  const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim() ?? "";
  try {
    const result = await withdrawOwnerCreditsFromServer(deployerPrivateKey);
    return new Response(
      JSON.stringify({
        withdrawnWei: result.withdrawnWei.toString(),
        txHash: result.txHash,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Withdraw failed.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
