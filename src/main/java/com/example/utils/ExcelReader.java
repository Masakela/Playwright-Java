package com.example.utils;

import java.io.FileInputStream;
import java.util.ArrayList;
import java.util.List;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

/**
 * ExcelReader — reads .xlsx test data via Apache POI (same as the Selenium
 * framework's reader). Data-driven tests here feed a TestNG @DataProvider, which
 * expects a Stream/Collection of arguments — readAsArguments builds exactly that.
 */
public class ExcelReader {

    private ExcelReader() { }   // static-only utility

    /** Read the DATA rows (skipping the header) as a list of String[] — feed to a @DataProvider. */
    public static List<String[]> readAsRows(String filePath, String sheetName) {
        List<String[]> rows = new ArrayList<>();
        DataFormatter fmt = new DataFormatter();

        try (FileInputStream fis = new FileInputStream(filePath);
             Workbook wb = new XSSFWorkbook(fis)) {

            Sheet sheet = wb.getSheet(sheetName);
            if (sheet == null) {
                throw new IllegalArgumentException("Sheet not found: " + sheetName);
            }

            boolean header = true;
            for (Row row : sheet) {
                if (header) { header = false; continue; }   // skip header row
                int cols = row.getLastCellNum();
                String[] values = new String[cols];
                for (int c = 0; c < cols; c++) {
                    Cell cell = row.getCell(c);
                    values[c] = cell == null ? "" : fmt.formatCellValue(cell).trim();
                }
                rows.add(values);
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to read " + filePath + " / " + sheetName, e);
        }
        return rows;
    }
}
