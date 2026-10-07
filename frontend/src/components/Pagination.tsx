const PAGE_SIZE = 25; // Matches the API's page size.

type Props = {
  page: number;
  count: number;
  onPageChange: (page: number) => void;
};

export function Pagination({ page, count, onPageChange }: Props) {
  if (count <= PAGE_SIZE) return null;
  const pages = Math.ceil(count / PAGE_SIZE);
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, count);

  return (
    <nav className="pagination" aria-label="Pages">
      <p>
        {first}–{last} of {count}
      </p>
      <div className="pagination__buttons">
        <button
          type="button"
          className="button button--secondary"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className="button button--secondary"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
