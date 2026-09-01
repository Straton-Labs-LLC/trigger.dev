import { type DataFunctionArgs } from "@remix-run/node";
import v8 from "v8";
import { createHeapSnapshotResponse } from "~/services/adminDiagnostics.server";
import { getRequestAbortSignal } from "~/services/httpAsyncStorage.server";
import { requireAdminApiRequest } from "~/services/personalAccessToken.server";

// Format date as yyyy-MM-dd HH_mm_ss_SSS
function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const milliseconds = date.getMilliseconds();

  return `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")} ${hours
    .toString()
    .padStart(2, "0")}_${minutes.toString().padStart(2, "0")}_${seconds
    .toString()
    .padStart(2, "0")}_${milliseconds.toString().padStart(3, "0")}`;
}

export async function loader({ request }: DataFunctionArgs) {
  await requireAdminApiRequest(request);

  return createHeapSnapshotResponse({
    snapshot: v8.getHeapSnapshot(),
    filename: `${getTaskIdentifier()}-${formatDate(new Date())}.heapsnapshot`,
    abortSignal: getRequestAbortSignal(),
  });
}

function getTaskIdentifier() {
  if (!process.env.ECS_CONTAINER_METADATA_URI) {
    return "local";
  }

  const url = new URL(process.env.ECS_CONTAINER_METADATA_URI);

  return url.pathname.split("/")[2].split("-")[0];
}
