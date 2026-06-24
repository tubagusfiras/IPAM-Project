// Reusable Table Component
export function Table({ children, ...props }) {
  return <table style={{width:"100%",borderCollapse:"collapse"}} {...props}>{children}</table>
}
export function Th({ children }) {
  return <th className="table-header">{children}</th>
}
export function Tr({ children, ...props }) {
  return <tr className="table-row" {...props}>{children}</tr>
}
export function Td({ children, ...props }) {
  return <td className="table-cell" {...props}>{children}</td>
}