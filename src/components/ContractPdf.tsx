import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: { paddingTop: 58, paddingBottom: 58, paddingHorizontal: 64, color: '#171715', fontFamily: 'Times-Roman', fontSize: 11, lineHeight: 1.55 },
  line: { minHeight: 5 },
  blankLine: { height: 9 },
  firstLine: { fontFamily: 'Times-Bold', fontSize: 13, textAlign: 'center', marginBottom: 12 },
})

export function ContractPdfDocument({ title, content }: { title: string; content: string }) {
  const lines = content.split(/\r?\n/)
  return (
    <Document title={title} language="pt-BR">
      <Page size="A4" style={styles.page} wrap>
        <View>
          {lines.map((line, index) => line.trim()
            ? <Text key={`${index}-${line}`} style={index === 0 ? styles.firstLine : styles.line}>{line}</Text>
            : <View key={`space-${index}`} style={styles.blankLine} />)}
        </View>
      </Page>
    </Document>
  )
}