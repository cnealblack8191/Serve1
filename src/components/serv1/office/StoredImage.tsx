import { useEffect, useState } from "react";

import { fileUrl } from "@/data";

/** Shows a stored file through a short-lived link. */
export function StoredImage({ path, alt }: { path: string; alt: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    fileUrl(path)
      .then((u) => live && setUrl(u))
      .catch(() => live && setUrl(""));
    return () => {
      live = false;
    };
  }, [path]);
  if (!url)
    return <div className="aspect-video rounded-md bg-muted" aria-label={`${alt} (loading)`} />;
  return <img src={url} alt={alt} className="aspect-video w-full rounded-md object-cover" />;
}
