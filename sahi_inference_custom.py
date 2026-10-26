    def predict_sliced_custom(self, model, image, conf_thresh=0.4):
        h, w = packed_canvas.shape[:2]
        
        # 1. Define slices (2 columns, 2 rows)
        # We add a small overlap (e.g., 40px) to ensure defects on the cut-line are caught
        overlap_w, overlap_h = 120, 0
        slice_w, slice_h = w // 2, h // 2
        
        # Coordinates for the 4 slices: [x1, y1, x2, y2]
        slice_coords = [
            [0, 0, slice_w + overlap_w, slice_h + overlap_h],           # Top-Left
            [slice_w - overlap_w, 0, w, slice_h + overlap_h],           # Top-Right
            [0, slice_h - overlap_h, slice_w + overlap_w, h],           # Bottom-Left
            [slice_w - overlap_w, slice_h - overlap_h, w, h]            # Bottom-Right
        ]

        # 2. Extract Slices
        image_list = []
        for sc in slice_coords:
            slice_img = packed_canvas[sc[1]:sc[3], sc[0]:sc[2]]
            # cv2.imshow("Sliced", slice_img)
            # cv2.waitKey(0)
            image_list.append(slice_img)

        # 3. Batch Prediction
        # This sends all 4 images to the GPU in one go
        batch_results = model.predict(image_list, return_masks=True, threshold=conf_thresh)

        # 4. Remap Predictions to Full Packed Canvas
        all_boxes = []
        all_masks = []
        all_scores = []
        all_ids = []

        for i, det in enumerate(batch_results):
            ox, oy = slice_coords[i][0], slice_coords[i][1]
            
            # Extract data from this slice's detection
            # Note: adjust attribute names (xyxy, mask, etc.) to match your RFDETR output object
            b = det.xyxy
            s = det.confidence
            m = det.mask
            cid = det.class_id

            for idx in range(len(b)):
                # Shift box coordinates back to packed_canvas space
                bx1, by1, bx2, by2 = b[idx]
                all_boxes.append([bx1 + ox, by1 + oy, bx2 + ox, by2 + oy])
                
                all_scores.append(s[idx])
                all_ids.append(cid[idx])
                
                # Remap mask: Create a full-canvas sized zero mask and place the slice-mask inside
                full_mask = np.zeros((h, w), dtype=np.uint8)
                slice_mask = m[idx].cpu().numpy() if hasattr(m[idx], 'cpu') else m[idx]
                
                # Ensure mask matches slice size then place at offset
                full_mask[oy : oy + slice_mask.shape[0], ox : ox + slice_mask.shape[1]] = slice_mask
                all_masks.append(full_mask)

        # 5. Non-Maximum Suppression (NMS) 
        # Important because overlaps will create double-detections
        final_boxes, final_scores, final_masks, final_ids =all_boxes, all_scores, all_masks, all_ids

        # final_boxes, final_scores, final_masks, final_ids = filter_overlapping_detections(
        #     all_boxes, all_scores, all_masks, all_ids, iou_thresh=0.3
        # )

        return final_boxes, final_scores, final_masks, final_ids    