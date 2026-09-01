import { type DataFunctionArgs } from "@remix-run/node";
import { waitTillGcFinishes } from "~/services/adminDiagnostics.server";
import { getRequestAbortSignal } from "~/services/httpAsyncStorage.server";
import { requireAdminApiRequest } from "~/services/personalAccessToken.server";

export async function loader({ request }: DataFunctionArgs) {
  await requireAdminApiRequest(request);

  const entry = await waitTillGcFinishes({ signal: getRequestAbortSignal() });

  return new Response(JSON.stringify(entry), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
