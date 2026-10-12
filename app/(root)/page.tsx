import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Models } from "node-appwrite";

import ActionDropdown from "@/components/ActionDropdown";
import { Chart } from "@/components/Chart";
import { FormattedDateTime } from "@/components/FormattedDateTime";
import { Thumbnail } from "@/components/Thumbnail";
import { Separator } from "@/components/ui/separator";
import { getFiles, getTotalSpaceUsed } from "@/lib/actions/file.actions";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { convertFileSize, getUsageSummary } from "@/lib/utils";
import { getOwnerId } from "@/lib/file-access";
import { fileViewUrl } from "@/lib/file-response";

const Dashboard = async () => {
  // Pages render in parallel with the layout, so check the session here too.
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const [files, totalSpace] = await Promise.all([
    getFiles({ types: [], limit: 10 }),
    getTotalSpaceUsed(),
  ]);

  const usageSummary = getUsageSummary(totalSpace);

  return (
    <div className="dashboard-container">
      <section>
        <Chart used={totalSpace.used} />

        {/* Uploaded file type summaries */}
        <ul className="dashboard-summary-list">
          {usageSummary.map((summary) => (
            <li key={summary.title}>
              <Link href={summary.url} className="dashboard-summary-card">
                <div className="space-y-4">
                  <div className="flex justify-between gap-3">
                    <Image
                      src={summary.icon}
                      width={100}
                      height={100}
                      alt=""
                      className="summary-type-icon"
                    />
                    <h4 className="summary-type-size">
                      {convertFileSize(summary.size)}
                    </h4>
                  </div>

                  <h5 className="summary-type-title">{summary.title}</h5>
                  <Separator className="bg-light-400" />
                  <FormattedDateTime
                    date={summary.latestDate}
                    className="text-center"
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Recent files uploaded */}
      <section className="dashboard-recent-files">
        <h2 className="h3 xl:h2 text-light-100">Recent files</h2>
        {files.rows.length > 0 ? (
          <ul className="mt-5 flex flex-col gap-5">
            {files.rows.map((file: Models.DefaultRow) => {
              const href = fileViewUrl(file.$id);
              return (
                <li className="flex items-center gap-3" key={file.$id}>
                  <Link href={href} target="_blank" rel="noopener noreferrer" prefetch={false} aria-label={`Open ${file.name}`}>
                    <Thumbnail type={file.type} extension={file.extension} url={href} />
                  </Link>

                  <div className="recent-file-details">
                    <Link
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      prefetch={false}
                      className="flex flex-col gap-1"
                    >
                      <p className="recent-file-name">{file.name}</p>
                      <FormattedDateTime date={file.$createdAt} className="caption" />
                    </Link>
                    <ActionDropdown
                      file={file}
                      isOwner={getOwnerId(file) === currentUser?.$id}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty-list">
            No files yet. Use the Upload button to add your first file.
          </p>
        )}
      </section>
    </div>
  );
};

export default Dashboard;
