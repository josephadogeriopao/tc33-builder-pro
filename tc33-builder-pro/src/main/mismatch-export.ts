import ExcelJS from 'exceljs'
import type { MismatchExportFormat } from '../shared/types'

export async function buildMismatchExport(format: MismatchExportFormat, issues: string[]): Promise<Buffer> {
  if (format === 'json') {
    return Buffer.from(JSON.stringify({
      title: 'TC33 Validation Mismatches',
      generatedAt: new Date().toISOString(),
      issues
    }, null, 2))
  }
  if (format === 'txt') {
    return Buffer.from(['TC33 Validation Mismatches', '', ...issues.map((line) => `- ${line}`)].join('\n'))
  }
  if (format === 'csv') {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
    return Buffer.from([['Issue'], ...issues.map((line) => [line])].map((row) => row.map(escape).join(',')).join('\r\n'))
  }
  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Validation Issues')
    sheet.addRow(['Validation issue'])
    for (const issue of issues) sheet.addRow([issue])
    sheet.getRow(1).font = { bold: true }
    sheet.columns = [{ width: 110 }]
    sheet.autoFilter = { from: 'A1', to: `A${Math.max(1, issues.length + 1)}` }
    return Buffer.from(await workbook.xlsx.writeBuffer())
  }
  if (format === 'docx') {
    const { Document, Packer, Paragraph, TextRun } = await import('docx')
    const document = new Document({ sections: [{ children: [
      new Paragraph({ children: [new TextRun({ text: 'TC33 Validation Mismatches', bold: true, size: 30 })] }),
      ...issues.map((line) => new Paragraph({ text: line }))
    ] }] })
    return Buffer.from(await Packer.toBuffer(document))
  }
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF()
  pdf.setFontSize(16)
  pdf.text('TC33 Validation Mismatches', 14, 18)
  pdf.setFontSize(10)
  const text = pdf.splitTextToSize(issues.join('\n'), 180)
  const linesPerPage = Math.max(1, Math.floor((pdf.internal.pageSize.getHeight() - 36) / 5))
  for (let index = 0; index < text.length; index += linesPerPage) {
    if (index > 0) pdf.addPage()
    pdf.text(text.slice(index, index + linesPerPage), 14, 28)
  }
  return Buffer.from(pdf.output('arraybuffer'))
}
