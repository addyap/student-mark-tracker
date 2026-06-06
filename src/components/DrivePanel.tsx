import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listDriveFiles } from "@/lib/google.functions";
import { Button } from "@/components/ui/button";
import { RefreshCw, ExternalLink, Paperclip, HardDrive } from "lucide-react";

export function DrivePanel({ onAttach }: { onAttach: (link: string, name: string) => void }) {
  const fetchFiles = useServerFn(listDriveFiles);
  const q = useQuery({
    queryKey: ["drive-files"],
    queryFn: () => fetchFiles(),
    enabled: false, // manual refresh only
    retry: false,
  });

  const files = q.data?.files ?? [];

  return (
    <div className="bg-card border rounded-lg p-5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-display text-base font-semibold">Drive Sync</h3>
        </div>
        <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1 ${q.isFetching ? "animate-spin" : ""}`} />
          {q.isFetching ? "Loading…" : "Drive Sync"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        Files live in your Google Drive folder — upload there, then Drive Sync to pull them in and attach.
      </p>

      {q.isError && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3 mb-3">
          {(q.error as Error).message}
        </div>
      )}

      {!q.isFetched && !q.isFetching && (
        <p className="text-sm text-muted-foreground">Click "Drive Sync" to list files in the configured folder.</p>
      )}

      {q.isFetched && files.length === 0 && !q.isError && (
        <p className="text-sm text-muted-foreground">No files found in the Drive folder.</p>
      )}

      {files.length > 0 && (
        <div className="divide-y border rounded-md">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{f.name}</div>
                {f.modifiedTime && (
                  <div className="text-xs text-muted-foreground">
                    Modified {new Date(f.modifiedTime).toLocaleDateString()}
                  </div>
                )}
              </div>
              {f.webViewLink && (
                <a href={f.webViewLink} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => f.webViewLink && onAttach(f.webViewLink, f.name)}
                disabled={!f.webViewLink}
              >
                <Paperclip className="h-3.5 w-3.5 mr-1" /> Attach
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
