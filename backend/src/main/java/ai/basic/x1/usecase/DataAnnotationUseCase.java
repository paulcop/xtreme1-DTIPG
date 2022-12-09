package ai.basic.x1.usecase;

import ai.basic.x1.entity.DataAnnotationClassificationBO;
import ai.basic.x1.entity.DataAnnotationObjectBO;
import ai.basic.x1.entity.DataAnnotationResultBO;
import cn.hutool.json.JSONArray;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static java.util.stream.Collectors.toList;

/**
 * @author chenchao
 * @date 2022/8/26
 */
public class DataAnnotationUseCase {

    @Autowired
    private DataEditUseCase dataEditUseCase;

    @Autowired
    private DataAnnotationClassificationUseCase dataAnnotationClassificationUseCase;

    @Autowired
    private DataAnnotationObjectUseCase dataAnnotationObjectUseCase;

    /**
     * for one data and one classiofication, it can only have one record, so query all saved dataAnnotations,
     * use classification id to match, if they match, update, if not, insert
     *
     * @param dataAnnotationClassificationBOs records that need save
     */
    @Transactional(rollbackFor = Exception.class)
    public List<DataAnnotationObjectBO> saveDataAnnotation(List<DataAnnotationClassificationBO> dataAnnotationClassificationBOs, List<DataAnnotationObjectBO> dataAnnotationObjectBOs, Set<Long> deletedDataIds) {

//        dataEditUseCase.checkLock(dataAnnotationClassificationBOs.stream().map(DataAnnotationClassificationBO::getDataId).collect(Collectors.toSet()));
        dataAnnotationClassificationUseCase.save(dataAnnotationClassificationBOs);
        return dataAnnotationObjectUseCase.save(dataAnnotationObjectBOs, deletedDataIds);
    }

    public List<DataAnnotationResultBO> findByDataIds(List<Long> dataIds) {
        List<DataAnnotationClassificationBO> dataAnnotationClassificationBOs = dataAnnotationClassificationUseCase.findByDataIds(dataIds);
        List<DataAnnotationObjectBO> dataAnnotationObjectBOs = dataAnnotationObjectUseCase.findByDataIds(dataIds);
        List<DataAnnotationResultBO> results = new ArrayList<>();
        for (Long dataId : dataIds) {
            List<DataAnnotationClassificationBO> classificationValues = dataAnnotationClassificationBOs.stream().filter(bo -> dataId.equals(bo.getDataId())).collect(toList());
            List<DataAnnotationObjectBO> objects = dataAnnotationObjectBOs.stream().filter(bo -> dataId.equals(bo.getDataId())).collect(toList());
            results.add(DataAnnotationResultBO.builder().dataId(dataId).classificationValues(classificationValues).objects(objects).build());
        }
        return results;
    }
}
